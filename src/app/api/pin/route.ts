import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/server/seal";
import { writeMember } from "@/lib/server/session";

/* The family PIN: entering it once marks this browser as family. */

const tries = new Map<string, { n: number; at: number }>();

export async function POST(req: NextRequest) {
  const pin = process.env.APP_PIN;
  if (!pin) return NextResponse.json({ error: "No PIN is set up." }, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const t = tries.get(ip);
  const now = Date.now();
  if (t && now - t.at < 10 * 60 * 1000 && t.n >= 8) {
    return NextResponse.json({ error: "Too many tries. Wait ten minutes." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { pin?: string };
  const given = String(body.pin ?? "").trim();
  if (!given || !safeEqual(given, pin)) {
    tries.set(ip, { n: (t && now - t.at < 10 * 60 * 1000 ? t.n : 0) + 1, at: t && now - t.at < 10 * 60 * 1000 ? t.at : now });
    return NextResponse.json({ error: "That PIN didn't match." }, { status: 401 });
  }
  tries.delete(ip);
  const res = NextResponse.json({ ok: true });
  writeMember(res);
  return res;
}
