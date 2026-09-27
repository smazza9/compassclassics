/* Turn raw Sonos and Spotify state into the cards the home screen shows. */

import type { NowTrack, RoomRef, SonosPlayer, SonosSnapshot, Zone } from "./types";
import type { SpDevice, SpPlayerState, SpotifyAccount } from "./spotify";
import { img } from "./spotify";
import type { HubRoom } from "./hub";
import type { BrowserPlayerStatus } from "./spotifyPlayer";

const PLAYING = new Set(["PLAYBACK_STATE_PLAYING", "PLAYBACK_STATE_BUFFERING"]);

const RANK = ["living", "family", "great", "den", "kitchen", "dining", "patio", "deck", "porch", "pool", "back", "yard", "garage", "shop", "office", "bed", "bath"];

/** A friendly, stable order for rooms: living spaces, then outside, then the garage. */
export function roomRank(name: string): number {
  const n = name.toLowerCase();
  const i = RANK.findIndex((k) => n.includes(k));
  return i === -1 ? RANK.length : i;
}

export function sortRoomsByName<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => roomRank(a.name) - roomRank(b.name) || a.name.localeCompare(b.name));
}

function speakerLine(p: SonosPlayer | undefined, hub: Map<string, HubRoom>): string {
  if (!p) return "";
  const h = hub.get(p.id);
  const n = p.deviceIds?.length ?? 1;
  if (h?.model) return h.model + (h.hasSub ? " · Sub" : "") + (n > 2 ? " · " + n + " speakers" : "");
  if (p.capabilities?.includes("HT_PLAYBACK")) return n > 1 ? "Home theater · " + n + " speakers" : "Home theater";
  return n > 1 ? n + " speakers, bonded" : "1 speaker";
}

export function sonosZones(snap: SonosSnapshot, hubRooms: HubRoom[]): Zone[] {
  const byId = new Map(snap.players.map((p) => [p.id, p]));
  const hub = new Map(hubRooms.map((r) => [r.id, r]));
  const order = sortRoomsByName(snap.players).map((p) => p.id);
  const zones = snap.groups
    .map((g): Zone | null => {
      const ids = [g.coordinatorId, ...g.playerIds.filter((x) => x !== g.coordinatorId)].filter((id) => byId.has(id));
      if (!ids.length) return null;
      const pb = snap.playback[g.id];
      const md = snap.metadata[g.id];
      const state = pb?.playbackState ?? g.playbackState ?? "";
      const tr = md?.currentItem?.track;
      const c = md?.container;
      const live = !tr?.durationMillis && (!!md?.streamInfo || /station|radio|stream/i.test(c?.type ?? ""));
      let track: NowTrack | null = null;
      if (tr?.name) {
        track = {
          title: tr.name,
          artist: tr.artist?.name ?? md?.streamInfo ?? "",
          album: tr.album?.name,
          art: tr.imageUrl ?? c?.imageUrl ?? null,
          durationMs: tr.durationMillis ?? null,
          live,
        };
      } else if (c?.name) {
        track = { title: c.name, artist: md?.streamInfo ?? "", art: c.imageUrl ?? null, durationMs: null, live: true };
      }
      const service = c?.service?.name ?? tr?.service?.name ?? null;
      const source = c?.name && c.name !== track?.title ? c.name + (service ? " · " + service : "") : service;
      const nx = md?.nextItem?.track;
      const acts = pb?.availablePlaybackActions;
      return {
        key: "sonos:" + g.id,
        kind: "sonos",
        id: g.id,
        name: ids.map((id) => byId.get(id)!.name).join(" + "),
        sub: ids.length > 1 ? ids.length + " rooms in sync" : speakerLine(byId.get(ids[0]), hub),
        roomIds: ids,
        playing: PLAYING.has(state),
        track,
        source,
        positionMs: pb?.positionMillis ?? null,
        positionAt: snap.at,
        canSkip: acts?.canSkip ?? !live,
        canSkipBack: acts?.canSkipBack ?? !live,
        members: ids.map((id) => ({
          roomId: id,
          name: byId.get(id)!.name,
          volume: snap.playerVolume[id]?.volume ?? 0,
          muted: snap.playerVolume[id]?.muted,
        })),
        upNext: nx?.name ? [{ title: nx.name, artist: nx.artist?.name ?? "", art: nx.imageUrl ?? null, durationMs: nx.durationMillis ?? null }] : [],
        speakers: ids.flatMap((id) => {
          const p = byId.get(id)!;
          const h = hub.get(id);
          const n = p.deviceIds?.length ?? 1;
          if (h?.model) {
            const list = [{ name: h.model, room: p.name }];
            if (h.hasSub) list.push({ name: "Sub", room: p.name });
            return list;
          }
          return Array.from({ length: n }, (_, i) => ({ name: n > 1 ? "Speaker " + (i + 1) : "Speaker", room: p.name }));
        }),
        glowSeed: track?.art || track?.title || g.id,
      };
    })
    .filter((z): z is Zone => !!z);
  return zones.sort((a, b) => order.indexOf(a.roomIds[0]) - order.indexOf(b.roomIds[0]));
}

export function sonosRooms(snap: SonosSnapshot, zones: Zone[]): RoomRef[] {
  return sortRoomsByName(snap.players).map((p) => {
    const z = zones.find((x) => x.roomIds.includes(p.id));
    return {
      id: p.id,
      name: p.name,
      kind: "sonos",
      zoneKey: z?.key ?? "",
      status: z ? (z.playing && z.track ? "Now: " + z.track.title : z.track ? "Paused" : "Quiet") : "Quiet",
    };
  });
}

const TYPE_LABEL: Record<string, string> = {
  computer: "Computer",
  smartphone: "Phone",
  tablet: "Tablet",
  speaker: "Speaker",
  tv: "TV",
  avr: "Receiver",
  stb: "TV box",
  audiodongle: "Audio adapter",
  gameconsole: "Game console",
  castvideo: "Cast device",
  castaudio: "Cast speaker",
  automobile: "Car",
};

export const spRoomId = (acctId: string, deviceId: string) => "sp:" + acctId + ":" + deviceId;
export function parseSpRoom(id: string): { acctId: string; deviceId: string } | null {
  if (!id.startsWith("sp:")) return null;
  const rest = id.slice(3);
  const i = rest.indexOf(":");
  if (i < 0) return null;
  return { acctId: rest.slice(0, i), deviceId: rest.slice(i + 1) };
}

export function spotifyZones(
  accounts: SpotifyAccount[],
  devices: Record<string, SpDevice[]>,
  states: Record<string, { s: SpPlayerState | null; at: number }>,
  browser: BrowserPlayerStatus,
): Zone[] {
  const out: Zone[] = [];
  for (const a of accounts) {
    const st = states[a.id]?.s ?? null;
    const at = states[a.id]?.at ?? 0;
    for (const d of devices[a.id] ?? []) {
      if (!d.id || d.is_restricted) continue;
      const active = st?.device?.id === d.id;
      const isBrowser = d.id === browser.deviceId;
      let track: NowTrack | null = null;
      let playing = false;
      let positionMs: number | null = null;
      let positionAt = at;
      if (active && st?.item) {
        track = {
          title: st.item.name,
          artist: st.item.artists?.map((x) => x.name).join(", ") ?? "",
          album: st.item.album?.name,
          art: img(st.item.album?.images),
          durationMs: st.item.duration_ms,
        };
        playing = st.is_playing;
        positionMs = st.progress_ms;
      } else if (isBrowser && browser.track) {
        track = { title: browser.track.title, artist: browser.track.artist, art: browser.track.art, durationMs: browser.track.durationMs };
        playing = !browser.paused;
        positionMs = browser.positionMs ?? null;
        positionAt = browser.at ?? at;
      }
      const id = spRoomId(a.id, d.id);
      out.push({
        key: "spotify:" + a.id + ":" + d.id,
        kind: "spotify",
        id: d.id,
        name: isBrowser ? "This device" : d.name,
        sub: (isBrowser ? d.name : TYPE_LABEL[d.type.toLowerCase()] ?? d.type) + (accounts.length > 1 ? " · " + a.name : "") + " · Spotify",
        roomIds: [id],
        playing,
        track,
        source: st?.context?.type && active ? "Spotify " + st.context.type : track ? "Spotify" : null,
        positionMs,
        positionAt,
        canSkip: true,
        canSkipBack: true,
        members: [{ roomId: id, name: isBrowser ? "This device" : d.name, volume: d.volume_percent ?? 0 }],
        upNext: [],
        speakers: [{ name: TYPE_LABEL[d.type.toLowerCase()] ?? d.type, room: d.name }],
        glowSeed: track?.art || d.name,
        accountId: a.id,
      });
    }
  }
  return out;
}

export function spotifyRooms(zones: Zone[]): RoomRef[] {
  return zones.map((z) => ({
    id: z.roomIds[0],
    name: z.name,
    kind: "spotify",
    zoneKey: z.key,
    status: z.playing && z.track ? "Now: " + z.track.title : z.sub,
  }));
}
