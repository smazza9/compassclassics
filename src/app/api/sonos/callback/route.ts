import { NextResponse, type NextRequest } from "next/server";
import { exchangeSonosCode, sonosRedirectUri, writeMember, writeSonos } from "@/lib/server/session";

/* Step two: Sonos sends the browser back here with a code we trade for tokens. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL("/?" + q, req.url));
    res.cookies.set("cc_sonos_state", "", { path: "/", maxAge: 0 });
    return res;
  };
  if (p.get("error")) return back("sonos=denied");
  const code = p.get("code");
  const state = p.get("state");
  if (!code || !state || state !== req.cookies.get("cc_sonos_state")?.value) return back("sonos=expired");
  try {
    const tokens = await exchangeSonosCode(code, sonosRedirectUri(req));
    const res = back("sonos=linked");
    writeSonos(res, tokens);
    writeMember(res);
    return res;
  } catch (e) {
    console.error("sonos callback", e);
    return back("sonos=failed");
  }
}
