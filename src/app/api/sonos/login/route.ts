import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { sonosConfigured, sonosRedirectUri } from "@/lib/server/session";

/* Step one of linking Sonos: send this browser to the Sonos sign-in page. */
export async function GET(req: NextRequest) {
  if (!sonosConfigured()) {
    return NextResponse.redirect(new URL("/?sonos=notready", req.url));
  }
  const state = randomBytes(16).toString("base64url");
  const url = new URL("https://api.sonos.com/login/v3/oauth");
  url.searchParams.set("client_id", process.env.SONOS_CLIENT_ID!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "playback-control-all");
  url.searchParams.set("redirect_uri", sonosRedirectUri(req));
  const res = NextResponse.redirect(url.toString());
  res.cookies.set("cc_sonos_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
