import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Which build is live, so an app left open on a phone can refresh itself. */
export async function GET() {
  return NextResponse.json({ build: process.env.VERCEL_GIT_COMMIT_SHA || "dev" }, { headers: { "Cache-Control": "no-store" } });
}
