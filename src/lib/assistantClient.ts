/*
 * The assistant loop, in the browser. Send the conversation to /api/assistant,
 * run any tools Claude asks for against the house, send the results back, and
 * repeat until Claude answers in words.
 */

import type { BetaContentBlock, BetaContentBlockParam, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { House } from "./house";
import type { PlayItem, RoomRef, SpotifyKind } from "./types";
import * as sp from "./spotify";
import { DEMO_FAVS } from "./demo";
import { clamp, errorText, norm } from "./util";

export interface ChatLine {
  role: "user" | "assistant";
  text: string;
  actions?: string[];
  error?: boolean;
}

const MAX_ROUNDS = 6;

/* ---------- house snapshot for the model ---------- */

export function houseSnapshot(h: House): string {
  const lines: string[] = [];
  lines.push(h.live ? "Mode: Dad's real Sonos system." : "Mode: example house (Sonos not linked yet), rooms are pretend.");
  const focus = h.focusRoom ? h.a.roomName(h.focusRoom) : null;
  lines.push("Focused room (the one he last opened): " + (focus ?? "none"));
  lines.push("Rooms:");
  for (const z of h.zones) {
    const what = z.track ? `"${z.track.title}"${z.track.artist ? " by " + z.track.artist : ""}${z.source ? " (from " + z.source + ")" : ""}` : "nothing loaded";
    const state = z.playing ? "playing " + what : z.track ? "paused on " + what : "quiet";
    const vols = z.members.map((m) => `${m.name} volume ${m.volume}`).join(", ");
    lines.push(`- ${z.name}${z.roomIds.length > 1 ? " (grouped, in sync)" : ""}: ${state}. ${vols}.`);
  }
  if (h.spotifyZones.length) {
    lines.push("Spotify speakers (also count as rooms):");
    for (const z of h.spotifyZones) {
      lines.push(`- ${z.name}: ${z.playing && z.track ? `playing "${z.track.title}" by ${z.track.artist}` : "idle"}, volume ${z.members[0]?.volume ?? 0}.`);
    }
  }
  const favs = h.live ? (h.favorites ?? []).map((f) => f.name) : DEMO_FAVS.map((f) => f.name);
  if (favs.length) lines.push("Sonos favorites: " + favs.slice(0, 40).join("; "));
  lines.push("Scenes: " + h.scenes.map((s) => s.name).join(", "));
  lines.push(h.primary ? "Spotify: connected, full search available." : "Spotify: not connected, so only Sonos favorites can be played.");
  const eqOk = h.live ? h.hub.status === "ok" : true;
  lines.push("Sound settings (bass, treble, sub): " + (eqOk ? "available." : "need the home hub, not connected."));
  return "<house>\n" + lines.join("\n") + "\n</house>";
}

/* ---------- room names to ids ---------- */

function allRooms(h: House): RoomRef[] {
  return [...h.rooms, ...h.spotifyRooms];
}

function resolveRooms(h: House, names: string[] | undefined): { ids: string[]; unknown: string[] } {
  const rooms = allRooms(h);
  const list = (names ?? []).filter(Boolean);
  if (!list.length) {
    if (h.focusRoom) return { ids: [h.focusRoom], unknown: [] };
    const playing = h.zones.find((z) => z.playing);
    if (playing) return { ids: [playing.roomIds[0]], unknown: [] };
    return { ids: h.rooms.length === 1 ? [h.rooms[0].id] : [], unknown: [] };
  }
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const raw of list) {
    const n = norm(raw).replace(/\b(the|room|speakers?)\b/g, " ").replace(/\s+/g, " ").trim();
    if (/^(everywhere|every|all|all rooms|whole house|house|everything)$/.test(n) || /every|whole house|all of/.test(n)) {
      ids.push(...h.rooms.map((r) => r.id));
      continue;
    }
    const exact = rooms.find((r) => norm(r.name) === norm(raw));
    const loose =
      exact ??
      rooms.find((r) => {
        const rn = norm(r.name).replace(/\b(the|room)\b/g, " ").replace(/\s+/g, " ").trim();
        return rn === n || rn.includes(n) || (n.length > 2 && n.includes(rn));
      });
    if (loose) ids.push(loose.id);
    else unknown.push(raw);
  }
  return { ids: [...new Set(ids)], unknown };
}

const roomList = (h: House) => allRooms(h).map((r) => r.name).join(", ");

/* ---------- tools ---------- */

async function findItem(h: House, query: string, kind: string): Promise<PlayItem | null> {
  if (kind === "favorite" || !h.primary) {
    const favs = h.live ? await h.a.loadFavorites() : [];
    const q = norm(query);
    if (h.live) {
      const f = favs.find((x) => norm(x.name) === q) ?? favs.find((x) => norm(x.name).includes(q) || q.includes(norm(x.name)));
      if (f) return { type: "sonos-favorite", id: f.id, title: f.name, subtitle: f.description || f.service?.name || "Sonos favorite", art: f.imageUrl };
    } else {
      for (const f of DEMO_FAVS) {
        if (norm(f.name).includes(q) || q.includes(norm(f.name))) return { type: "demo", favId: f.id, title: f.name, subtitle: f.kind };
        const i = f.tracks.findIndex((t) => q.includes(norm(t[0])) || norm(t[0] + " " + t[1]).includes(q));
        if (i >= 0) return { type: "demo", favId: f.id, start: i, title: f.tracks[i][0], subtitle: f.tracks[i][1] };
      }
      // In the example house, fall back to the favorite that best fits the words.
      const words = q.split(" ");
      const scored = DEMO_FAVS.map((f) => ({ f, s: words.filter((w) => w.length > 2 && norm(f.name + " " + f.tracks.map((t) => t[1]).join(" ")).includes(w)).length }));
      scored.sort((a, b) => b.s - a.s);
      if (scored[0].s > 0) return { type: "demo", favId: scored[0].f.id, title: scored[0].f.name, subtitle: scored[0].f.kind };
    }
    if (kind === "favorite" || !h.primary) return null;
  }
  const acct = h.primary!;
  const type: SpotifyKind = kind === "song" ? "track" : kind === "artist" ? "artist" : kind === "album" ? "album" : "playlist";
  const r = await sp.search(acct, query, [type]);
  if (type === "track" && r.tracks[0]) return sp.trackToItem(r.tracks[0]);
  if (type === "artist" && r.artists[0]) return sp.artistToItem(r.artists[0]);
  if (type === "album" && r.albums[0]) return sp.albumToItem(r.albums[0]);
  if (type === "playlist") {
    // Prefer playlists he owns (Spotify only lets apps read those), then any.
    const mine = r.playlists.find((p) => p.owner?.id === acct.id);
    const p = mine ?? r.playlists[0];
    if (p) return sp.playlistToItem(p);
  }
  return null;
}

export type Input = Record<string, unknown>;

export async function runTool(h: House, name: string, input: Input): Promise<{ text: string; action?: string; error?: boolean }> {
  try {
    switch (name) {
      case "play_music": {
        const { ids, unknown } = resolveRooms(h, input.rooms as string[]);
        if (unknown.length) return { text: `No room called ${unknown.join(", ")}. Rooms are: ${roomList(h)}.`, error: true };
        if (!ids.length) return { text: "Which room? Rooms are: " + roomList(h) + ".", error: true };
        const item = await findItem(h, String(input.query ?? ""), String(input.kind ?? "song"));
        if (!item) return { text: `Couldn't find "${input.query}".`, error: true };
        const msg = await h.a.play(item, ids);
        return { text: msg + (item.type === "spotify" ? ` (${item.subtitle})` : ""), action: msg };
      }
      case "playback": {
        const { ids, unknown } = resolveRooms(h, input.rooms as string[]);
        if (unknown.length) return { text: `No room called ${unknown.join(", ")}. Rooms are: ${roomList(h)}.`, error: true };
        const zones = [...new Map(ids.map((id) => [h.a.zoneOfRoom(id)?.key, h.a.zoneOfRoom(id)])).values()].filter(Boolean);
        const act = String(input.action);
        for (const z of zones) {
          if (!z) continue;
          if (act === "pause") await h.a.setPlaying(z.key, false);
          else if (act === "resume") await h.a.setPlaying(z.key, true);
          else await h.a.step(z.key, act === "previous" ? -1 : 1);
        }
        const words = { pause: "Paused", resume: "Playing again", next: "Skipped ahead", previous: "Went back a song" }[act] ?? "Done";
        const msg = words + " " + (zones.length > 1 ? "in " + zones.length + " rooms" : "in " + (zones[0]?.name ?? "that room")) + ".";
        return { text: msg, action: msg };
      }
      case "set_volume": {
        const { ids, unknown } = resolveRooms(h, input.rooms as string[]);
        if (unknown.length) return { text: `No room called ${unknown.join(", ")}. Rooms are: ${roomList(h)}.`, error: true };
        const out: string[] = [];
        for (const id of ids) {
          const z = h.a.zoneOfRoom(id);
          const cur = z?.members.find((m) => m.roomId === id)?.volume ?? 30;
          const v = typeof input.level === "number" ? input.level : cur + (typeof input.change === "number" ? input.change : 0);
          const nv = clamp(Math.round(v), 0, 100);
          h.a.setVolume(id, nv);
          out.push(`${h.a.roomName(id)} ${nv}`);
        }
        const msg = "Volume: " + out.join(", ") + ".";
        return { text: msg, action: msg };
      }
      case "group_rooms": {
        const { ids, unknown } = resolveRooms(h, input.rooms as string[]);
        if (unknown.length) return { text: `No room called ${unknown.join(", ")}. Rooms are: ${roomList(h)}.`, error: true };
        const msg = await h.a.groupRooms(ids);
        return { text: msg, action: msg };
      }
      case "separate_rooms": {
        const { ids, unknown } = resolveRooms(h, input.rooms as string[]);
        if (unknown.length) return { text: `No room called ${unknown.join(", ")}. Rooms are: ${roomList(h)}.`, error: true };
        for (const id of ids) await h.a.leave(id);
        const msg = "Separated " + ids.map(h.a.roomName).join(", ") + ".";
        return { text: msg, action: msg };
      }
      case "set_sound": {
        const { ids } = resolveRooms(h, [String(input.room ?? "")]);
        const id = ids[0];
        if (!id) return { text: "Which room? Rooms are: " + roomList(h) + ".", error: true };
        if (!h.a.canEq(id)) return { text: "Bass and treble need the home hub, which isn't connected yet.", error: true };
        const patch: Record<string, unknown> = {};
        if (typeof input.bass === "number") patch.bass = clamp(input.bass, -10, 10);
        if (typeof input.treble === "number") patch.treble = clamp(input.treble, -10, 10);
        if (typeof input.sub === "number") patch.subGain = clamp(input.sub, -15, 15);
        if (typeof input.loudness === "boolean") patch.loudness = input.loudness;
        h.a.setEq(id, patch);
        const msg = "Sound in the " + h.a.roomName(id) + ": " + Object.entries(patch).map(([k, v]) => (k === "subGain" ? "sub" : k) + " " + v).join(", ") + ".";
        return { text: msg, action: msg };
      }
      case "run_scene": {
        const msg = await h.a.runScene(String(input.name ?? ""));
        return { text: msg, action: msg };
      }
      case "find_music": {
        if (!h.primary) return { text: "Spotify isn't connected, so search isn't available.", error: true };
        const kind = String(input.kind ?? "song");
        const type: SpotifyKind = kind === "song" ? "track" : (kind as SpotifyKind);
        const r = await sp.search(h.primary, String(input.query ?? ""), [type]);
        const rows =
          type === "track"
            ? r.tracks.slice(0, 6).map((t) => `${t.name} by ${t.artists.map((x) => x.name).join(", ")} (${t.album?.name ?? ""}${t.album?.release_date ? ", " + t.album.release_date.slice(0, 4) : ""})`)
            : type === "album"
              ? r.albums.slice(0, 6).map((a) => `${a.name} by ${a.artists.map((x) => x.name).join(", ")} (${a.release_date?.slice(0, 4) ?? ""})`)
              : type === "artist"
                ? r.artists.slice(0, 6).map((a) => a.name)
                : r.playlists.slice(0, 6).map((p) => `${p.name}${p.owner?.display_name ? " by " + p.owner.display_name : ""}`);
        return { text: rows.length ? rows.join("\n") : "Nothing found." };
      }
    }
    return { text: "Unknown tool " + name, error: true };
  } catch (e) {
    return { text: errorText(e), error: true };
  }
}

/* ---------- the loop ---------- */

/** Blocks we can send back. After a mid-answer fallback, drop the declined model's internals. */
function echo(content: BetaContentBlock[]): BetaContentBlockParam[] {
  let lastFallback = -1;
  content.forEach((b, i) => {
    if (b.type === "fallback") lastFallback = i;
  });
  return content
    .filter((b, i) => {
      if (b.type === "fallback") return false;
      if (i < lastFallback && (b.type === "thinking" || b.type === "redacted_thinking" || b.type === "tool_use")) return false;
      return true;
    })
    .map((b) => b as unknown as BetaContentBlockParam);
}

export class AssistantLocked extends Error {}

export async function askAssistant(
  getHouse: () => House,
  history: BetaMessageParam[],
  userText: string,
  onAction: (msg: string) => void,
): Promise<{ history: BetaMessageParam[]; reply: string; actions: string[] }> {
  const msgs: BetaMessageParam[] = [
    ...trimHistory(history),
    { role: "user", content: [{ type: "text", text: houseSnapshot(getHouse()) + "\n\n" + userText }] },
  ];
  const actions: string[] = [];
  let reply = "";
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs }),
    });
    const j = (await res.json().catch(() => ({}))) as { content?: BetaContentBlock[]; stop_reason?: string; error?: string };
    if (res.status === 401 && j.error === "locked") throw new AssistantLocked("locked");
    if (!res.ok || !j.content) throw new Error(j.error || "The assistant couldn't answer (" + res.status + ").");
    if (j.stop_reason === "refusal") {
      reply = "Sorry, I can't help with that one. Try asking another way.";
      break;
    }
    const content = j.content;
    const text = content
      .filter((b): b is Extract<BetaContentBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    msgs.push({ role: "assistant", content: echo(content) });
    const uses = content.filter((b): b is Extract<BetaContentBlock, { type: "tool_use" }> => b.type === "tool_use");
    if (j.stop_reason !== "tool_use" || !uses.length) {
      reply = text || (actions.length ? actions.join(" ") : "Done.");
      break;
    }
    const results: BetaContentBlockParam[] = [];
    for (const u of uses) {
      const r = await runTool(getHouse(), u.name, (u.input ?? {}) as Input);
      if (r.action) {
        actions.push(r.action);
        onAction(r.action);
      }
      results.push({ type: "tool_result", tool_use_id: u.id, content: r.text, is_error: r.error || undefined });
    }
    // Let the house catch up before Claude looks at it again.
    await new Promise((r) => setTimeout(r, 400));
    results.push({ type: "text", text: houseSnapshot(getHouse()) });
    msgs.push({ role: "user", content: results });
    if (round === MAX_ROUNDS - 1) reply = actions.length ? actions.join(" ") : "Done.";
  }
  return { history: msgs, reply, actions };
}

/** Keep the conversation short: whole exchanges only, starting at a plain user message. */
function trimHistory(h: BetaMessageParam[]): BetaMessageParam[] {
  if (h.length <= 16) return h;
  let start = h.length - 16;
  while (start < h.length) {
    const m = h[start];
    const isPlainUser = m.role === "user" && Array.isArray(m.content) && !m.content.some((b) => (b as { type: string }).type === "tool_result");
    if (isPlainUser) break;
    start++;
  }
  return h.slice(start);
}
