import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { NextResponse, type NextRequest } from "next/server";
import { MODEL, SYSTEM, TOOLS } from "@/lib/assistantSpec";
import { isMember } from "@/lib/server/session";

export const maxDuration = 60;

/*
 * One step of the assistant. The browser keeps the conversation and runs the
 * tools; this route adds the instructions and asks Claude what to do next.
 * Refusal fallback is on ("fallbacks: default"): if Claude Opus 5 declines,
 * the API retries on Anthropic's recommended fallback model in the same call.
 */

const MAX_BODY = 120_000;
const MAX_MESSAGES = 40;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "The assistant isn't switched on yet. It needs its API key in the app settings on Vercel." }, { status: 503 });
  }
  if (!isMember(req)) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "That conversation got too long. Start a new one." }, { status: 413 });

  let messages: BetaMessageParam[];
  try {
    const body = JSON.parse(raw) as { messages?: BetaMessageParam[] };
    messages = (body.messages ?? []).slice(-MAX_MESSAGES);
    if (!messages.length || messages.some((m) => m.role !== "user" && m.role !== "assistant")) throw new Error("bad");
    if (messages[0].role !== "user") throw new Error("bad");
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const client = new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2048,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      tool_choice: { type: "auto" },
      messages,
    });
    return NextResponse.json({ content: res.content, stop_reason: res.stop_reason, model: res.model });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      const status = e.status ?? 502;
      const msg =
        status === 429 || status === 529
          ? "The assistant is busy for a moment. Try again in a few seconds."
          : status === 401
            ? "The assistant's API key isn't working. Stephen needs to check it on Vercel."
            : "The assistant hit a snag (" + status + "). Try again.";
      return NextResponse.json({ error: msg }, { status: status >= 500 ? 502 : status });
    }
    return NextResponse.json({ error: "The assistant couldn't be reached. Check the internet and try again." }, { status: 502 });
  }
}
