import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { hasSecret, seal, unseal } from "./seal";

/*
 * Sonos sign-in (tokens) and the family pass, both kept in sealed cookies.
 * A browser becomes "family" when it links Sonos or enters the app PIN; only
 * family browsers can use the assistant, since that costs API credits.
 */

export const SONOS_COOKIE = "cc_sonos";
export const MEMBER_COOKIE = "cc_member";
export const SONOS_API = "https://api.ws.sonos.com/control/api/v1";
const SONOS_TOKEN_URL = "https://api.sonos.com/login/v3/oauth/access";

export interface SonosTokens {
  /** access token */
  a: string;
  /** refresh token */
  r: string;
  /** access token expiry, ms since epoch */
  e: number;
}

const YEAR = 60 * 60 * 24 * 365;

const cookieBase = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

export const sonosConfigured = () => !!(process.env.SONOS_CLIENT_ID && process.env.SONOS_CLIENT_SECRET && hasSecret());

export function appOrigin(req: NextRequest): string {
  return (process.env.APP_URL || req.nextUrl.origin).replace(/\/+$/, "");
}

export const sonosRedirectUri = (req: NextRequest) => appOrigin(req) + "/api/sonos/callback";

export function readSonos(req: NextRequest): SonosTokens | null {
  if (!hasSecret()) return null;
  return unseal<SonosTokens>(req.cookies.get(SONOS_COOKIE)?.value);
}

export function writeSonos(res: NextResponse, t: SonosTokens) {
  res.cookies.set(SONOS_COOKIE, seal(t), { ...cookieBase(), maxAge: YEAR });
}

export function clearSonos(res: NextResponse) {
  res.cookies.set(SONOS_COOKIE, "", { ...cookieBase(), maxAge: 0 });
}

export function isMember(req: NextRequest): boolean {
  if (!hasSecret()) return false;
  if (unseal<{ v: number }>(req.cookies.get(MEMBER_COOKIE)?.value)) return true;
  return !!readSonos(req);
}

export function writeMember(res: NextResponse) {
  res.cookies.set(MEMBER_COOKIE, seal({ v: 1, at: Date.now() }), { ...cookieBase(), maxAge: YEAR * 2 });
}

async function tokenCall(params: Record<string, string>): Promise<SonosTokens> {
  const id = process.env.SONOS_CLIENT_ID ?? "";
  const secret = process.env.SONOS_CLIENT_SECRET ?? "";
  const res = await fetch(SONOS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      Authorization: "Basic " + Buffer.from(id + ":" + secret).toString("base64"),
    },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error("Sonos sign in failed (" + res.status + "): " + text.slice(0, 200));
  const j = JSON.parse(text) as { access_token: string; refresh_token?: string; expires_in?: number };
  return { a: j.access_token, r: j.refresh_token ?? "", e: Date.now() + (j.expires_in ?? 86400) * 1000 };
}

export const exchangeSonosCode = (code: string, redirectUri: string) =>
  tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri });

export async function refreshSonos(t: SonosTokens): Promise<SonosTokens> {
  const n = await tokenCall({ grant_type: "refresh_token", refresh_token: t.r });
  return { ...n, r: n.r || t.r };
}

/**
 * Call the Sonos Control API with this browser's sign-in, refreshing the
 * access token when it is close to expiring or Sonos says it is stale.
 * Returns the new tokens when they changed, so the caller can save them.
 */
export async function sonosCall(
  tokens: SonosTokens,
  path: string,
  init: { method?: string; body?: string } = {},
): Promise<{ res: Response; tokens: SonosTokens; refreshed: boolean }> {
  let t = tokens;
  let refreshed = false;
  if (t.e - Date.now() < 5 * 60 * 1000) {
    t = await refreshSonos(t);
    refreshed = true;
  }
  const go = (tok: SonosTokens) =>
    fetch(SONOS_API + "/" + path.replace(/^\/+/, ""), {
      method: init.method ?? "GET",
      headers: { Authorization: "Bearer " + tok.a, "Content-Type": "application/json" },
      body: init.body,
      cache: "no-store",
    });
  let res = await go(t);
  if (res.status === 401 && !refreshed) {
    t = await refreshSonos(t);
    refreshed = true;
    res = await go(t);
  }
  return { res, tokens: t, refreshed };
}
