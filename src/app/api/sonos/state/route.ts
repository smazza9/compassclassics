import { NextResponse, type NextRequest } from "next/server";
import { readSonos, sonosCall, writeSonos, type SonosTokens } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/*
 * Everything the home screen needs in one trip: groups, players, what each
 * group is playing, and every volume. The app polls this every few seconds
 * while it is open, so it is one request instead of a dozen.
 */

type Json = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const t0 = readSonos(req);
  if (!t0) return NextResponse.json({ error: "Sonos isn't linked" }, { status: 401 });

  let tokens: SonosTokens = t0;
  let changed = false;
  const get = async (path: string): Promise<Json | null> => {
    const r = await sonosCall(tokens, path);
    if (r.refreshed) {
      tokens = r.tokens;
      changed = true;
    }
    if (!r.res.ok) {
      if (r.res.status === 401 || r.res.status === 403) throw Object.assign(new Error("unauthorized"), { status: r.res.status });
      return null;
    }
    return (await r.res.json().catch(() => null)) as Json | null;
  };

  try {
    const hh = await get("households");
    const households = ((hh?.households as { id: string; name?: string }[]) ?? []).map((h) => ({ id: h.id, name: h.name }));
    if (!households.length) {
      return NextResponse.json({ error: "No Sonos system was found on that account." }, { status: 404 });
    }
    const want = req.nextUrl.searchParams.get("hh");
    const householdId = households.find((h) => h.id === want)?.id ?? households[0].id;

    const g = await get("households/" + householdId + "/groups");
    const groups = ((g?.groups as Json[]) ?? []) as unknown as { id: string; playerIds: string[] }[];
    const players = ((g?.players as Json[]) ?? []) as unknown as { id: string }[];

    const playback: Record<string, Json | null> = {};
    const metadata: Record<string, Json | null> = {};
    const groupVolume: Record<string, Json | null> = {};
    const playerVolume: Record<string, Json | null> = {};

    // Settle the token refresh first so parallel calls don't each refresh.
    if (tokens.e - Date.now() < 5 * 60 * 1000) await get("households");

    await Promise.all([
      ...groups.flatMap((grp) => [
        get("groups/" + grp.id + "/playback").then((j) => (playback[grp.id] = j)),
        get("groups/" + grp.id + "/playbackMetadata").then((j) => (metadata[grp.id] = j)),
        get("groups/" + grp.id + "/groupVolume").then((j) => (groupVolume[grp.id] = j)),
      ]),
      ...players.map((p) => get("players/" + p.id + "/playerVolume").then((j) => (playerVolume[p.id] = j))),
    ]);

    const res = NextResponse.json(
      { householdId, households, groups, players, playback, metadata, groupVolume, playerVolume, at: Date.now() },
      { headers: { "Cache-Control": "no-store" } },
    );
    if (changed) writeSonos(res, tokens);
    return res;
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) {
      return NextResponse.json({ error: "Sonos sign in expired. Link Sonos again in Settings." }, { status: 401 });
    }
    console.error("sonos state", e);
    return NextResponse.json({ error: "Couldn't reach Sonos right now." }, { status: 502 });
  }
}
