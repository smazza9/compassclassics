import { NextResponse } from "next/server";
import { clearSonos } from "@/lib/server/session";

/* Forget the Sonos sign-in on this browser. The family pass stays. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSonos(res);
  return res;
}
