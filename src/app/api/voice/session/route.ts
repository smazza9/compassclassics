import { NextResponse, type NextRequest } from "next/server";
import { isMember } from "@/lib/server/session";
import { VOICE_INSTRUCTIONS, VOICE_MODEL, VOICE_VOICE, voiceTools } from "@/lib/voiceSpec";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
 * Starts a voice session. The session (model, instructions with the house as
 * it is right now, the house tools, voice, turn taking) is baked into a
 * short-lived client secret; the browser opens the WebRTC call with it and
 * never sees the real API key. Same approach as Compass Concierge, its own key.
 */

const SNAPSHOT_CAP = 6_000;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "The voice assistant isn't switched on yet. It needs its key." }, { status: 503 });
  if (!isMember(req)) return NextResponse.json({ error: "locked" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { snapshot?: unknown; mic?: unknown } | null;
  let snapshot = typeof body?.snapshot === "string" ? body.snapshot : "";
  if (snapshot.length > SNAPSHOT_CAP) snapshot = snapshot.slice(0, SNAPSHOT_CAP) + "\n…";
  const farField = body?.mic === "far";

  const session = {
    type: "realtime",
    model: VOICE_MODEL,
    instructions: VOICE_INSTRUCTIONS + (snapshot ? "\n\nThe house when this conversation started:\n" + snapshot : ""),
    tools: voiceTools(),
    tool_choice: "auto",
    audio: {
      input: {
        transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
        noise_reduction: { type: farField ? "far_field" : "near_field" },
        // A turn ends when the words say he's done, not at the first pause.
        turn_detection: { type: "semantic_vad", eagerness: "low", create_response: true, interrupt_response: true },
      },
      output: { voice: VOICE_VOICE },
    },
  };

  try {
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 600 }, session }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { value?: string; expires_at?: number; error?: { message?: string } } | null;
    if (!res.ok || !json?.value) {
      console.error("[voice session] client_secrets failed", res.status, json);
      const msg =
        res.status === 401
          ? "The voice key isn't working. Stephen needs to check it on Vercel."
          : res.status === 429
            ? "The voice assistant is busy for a moment. Try again in a few seconds."
            : json?.error?.message || "Couldn't start the voice assistant (" + res.status + ").";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    return NextResponse.json({ client_secret: json.value, expires_at: json.expires_at ?? null, model: VOICE_MODEL });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the voice service. Check the internet and try again." }, { status: 502 });
  }
}
