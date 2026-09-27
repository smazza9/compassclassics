import { NextResponse, type NextRequest } from "next/server";
import { isMember, readSonos, sonosConfigured } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** What is switched on for this app and this browser. No secrets, only yes or no. */
export async function GET(req: NextRequest) {
  return NextResponse.json(
    {
      sonosReady: sonosConfigured(),
      sonosLinked: !!readSonos(req),
      assistantReady: !!process.env.ANTHROPIC_API_KEY,
      spotifyClientId: process.env.SPOTIFY_CLIENT_ID || null,
      member: isMember(req),
      pinSet: !!process.env.APP_PIN,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
