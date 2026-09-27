import { NextResponse, type NextRequest } from "next/server";
import { readSonos, sonosCall, writeSonos } from "@/lib/server/session";

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
    const { res, tokens: t, refreshed } = await sonosCall(tokens, joined, { method: req.method, body: body || undefined });
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
