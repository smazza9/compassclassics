import { NextResponse } from "next/server";

/*
 * The event callback address registered with Sonos. The app polls instead of
 * subscribing to events, so there is nothing to process: answer politely.
 */
export async function POST() {
  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: true, app: "compass-classics" });
}
