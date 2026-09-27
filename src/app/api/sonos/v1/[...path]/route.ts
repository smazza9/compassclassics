import { NextResponse, type NextRequest } from "next/server";
import { rateLimitInfo, readSonos, sonosCall, writeSonos } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/*
 * Pass-through to the Sonos Control API for commands (play, volume, group,
 * favorites). Only the namespaces the app uses are allowed.
 */

const ALLOWED = /^(households|groups|players)\/[A-Za-z0-9_.:%-]+(\/[A-Za-z0-9_.:%-]+)*$/;

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.map(encodeURIComponent).join("/");
  if (!ALLOWED.test(joined)) return NextResponse.json({ error: "Not allowed" }, { status: 400 });
  const tokens = readSonos(req);
  if (!tokens) return NextResponse.json({ error: "Sonos isn't linked. Link it in Settings." }, { status: 401 });

  const body = req.method === "GET" || req.method === "DELETE" ? undefined : await req.text();
  try {
    let { res, tokens: t, refreshed } = await sonosCall(tokens, joined, { method: req.method, body: body || undefined });
    let retryAfter = 0;
    if (res.status === 429) {
      // A short "slow down" is worth one quiet retry so a tap still works.
      retryAfter = rateLimitInfo(res, joined);
      if (retryAfter <= 2) {
        await new Promise((r) => setTimeout(r, retryAfter ? retryAfter * 1000 : 1500));
        const again = await sonosCall(t, joined, { method: req.method, body: body || undefined });
        res = again.res;
        t = again.tokens;
        refreshed = refreshed || again.refreshed;
        if (res.status === 429) retryAfter = rateLimitInfo(res, joined);
      }
    }
    if (res.status === 429) {
      const mins = Math.max(1, Math.round((retryAfter || 60) / 60));
      const wait = mins >= 90 ? "about " + Math.round(mins / 60) + " hours" : mins === 1 ? "about a minute" : "about " + mins + " minutes";
      const out = NextResponse.json(
        {
          error:
            mins >= 15
              ? "Sonos's daily limit for outside apps is used up. It resets in " + wait + ", then everything works again."
              : "Sonos is asking apps to slow down. Give it " + wait + " and try again.",
          errorCode: "RATE_LIMITED",
          retryAfter,
          status: 429,
        },
        { status: 429 },
      );
      if (refreshed) writeSonos(out, t);
      return out;
    }
    const text = await res.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : { ok: true };
    } catch {
      payload = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      const p = payload as { errorCode?: string; reason?: string; _objectType?: string } | null;
      const code = p?.errorCode ?? "";
      const friendly =
        code === "ERROR_DISALLOWED_BY_POLICY"
          ? "Sonos won't allow that for this music."
          : code === "ERROR_PLAYBACK_NO_CONTENT"
            ? "There's nothing loaded in that room yet. Pick some music first."
            : code
              ? "Sonos said " + code.replace(/^ERROR_/, "").replace(/_/g, " ").toLowerCase() + "."
              : "Sonos error " + res.status + ".";
      const out = NextResponse.json({ error: friendly, errorCode: code, status: res.status }, { status: res.status === 401 ? 401 : res.status });
      if (refreshed) writeSonos(out, t);
      return out;
    }
    const out = NextResponse.json(payload ?? { ok: true });
    if (refreshed) writeSonos(out, t);
    return out;
  } catch (e) {
    console.error("sonos proxy", e);
    return NextResponse.json({ error: "Couldn't reach Sonos right now." }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
