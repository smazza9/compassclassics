import { NextResponse, type NextRequest } from "next/server";
import { readSonos, sonosCall, writeSonos, type SonosTokens } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/*
 * Everything the home screen needs in one trip: groups, players, what each
 * group is playing, and (when asked) every player's volume. The app polls this
 * while it's open, so it is careful with Sonos's rate limits:
 *   - the household id comes from the app after the first call (?hh=),
 *   - volumes only when asked (?vol=1),
 *   - a rate-limited or failed piece comes back empty instead of failing the
 *     whole snapshot, and "busy" is never reported as "no Sonos".
 */

type Json = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const t0 = readSonos(req);
  if (!t0) return NextResponse.json({ error: "Sonos isn't linked" }, { status: 401 });

  let tokens: SonosTokens = t0;
  let changed = false;
  let limited = false;
  const get = async (path: string): Promise<{ json: Json | null; status: number }> => {
    const r = await sonosCall(tokens, path);
    if (r.refreshed) {
      tokens = r.tokens;
      changed = true;
    }
    if (r.res.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
    if (r.res.status === 429) limited = true;
    if (!r.res.ok) return { json: null, status: r.res.status };
    return { json: (await r.res.json().catch(() => null)) as Json | null, status: r.res.status };
  };
  const done = (body: Json, status = 200) => {
    const res = NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
    if (changed) writeSonos(res, tokens);
    return res;
  };

  try {
    const want = req.nextUrl.searchParams.get("hh");
    const withVolumes = req.nextUrl.searchParams.get("vol") === "1";
    let householdId = want ?? "";
    let households: { id: string; name?: string }[] = want ? [{ id: want }] : [];
    if (!want) {
      const hh = await get("households");
      if (!hh.json) return done({ error: "busy", limited }, hh.status === 429 ? 429 : 503);
      households = ((hh.json.households as { id: string; name?: string }[]) ?? []).map((h) => ({ id: h.id, name: h.name }));
      if (!households.length) return done({ error: "No Sonos system was found on that account." }, 404);
      householdId = households[0].id;
    }

    const g = await get("households/" + householdId + "/groups");
    if (!g.json) {
      // A stale household id (rare) gets a fresh look next time; anything else is just busy.
      return done({ error: "busy", limited, staleHousehold: g.status === 404 || g.status === 410 }, g.status === 429 ? 429 : 503);
    }
    const groups = ((g.json.groups as Json[]) ?? []) as unknown as { id: string; playerIds: string[]; playbackState?: string }[];
    // Quiet rooms don't change: check what's playing every time, the rest only with volumes (every few polls).
    const busy = (s?: string) => s === "PLAYBACK_STATE_PLAYING" || s === "PLAYBACK_STATE_BUFFERING";
    const detailFor = groups.filter((grp) => withVolumes || busy(grp.playbackState));
    const players = ((g.json.players as Json[]) ?? []) as unknown as { id: string }[];

    const playback: Record<string, Json | null> = {};
    const metadata: Record<string, Json | null> = {};
    const playerVolume: Record<string, Json | null> = {};

    await Promise.all([
      ...detailFor.flatMap((grp) => [
        get("groups/" + grp.id + "/playback").then((r) => (playback[grp.id] = r.json)),
        get("groups/" + grp.id + "/playbackMetadata").then((r) => (metadata[grp.id] = r.json)),
      ]),
      ...(withVolumes ? players.map((p) => get("players/" + p.id + "/playerVolume").then((r) => (playerVolume[p.id] = r.json))) : []),
    ]);

    return done({
      householdId,
      households,
      groups,
      players,
      playback,
      metadata,
      groupVolume: {},
      playerVolume,
      volumes: withVolumes,
      limited,
      at: Date.now(),
    });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401) return done({ error: "Sonos sign in expired. Link Sonos again in Settings." }, 401);
    console.error("sonos state", e);
    return done({ error: "busy" }, 503);
  }
}
