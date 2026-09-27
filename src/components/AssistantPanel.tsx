"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { useHouse, type House } from "@/lib/house";
import { askAssistant, AssistantLocked, type ChatLine } from "@/lib/assistantClient";
import { cx, errorText } from "@/lib/util";
import { Icon } from "./Icons";

/* The conversation lives outside the component so it survives switching tabs. */
interface ChatState {
  lines: ChatLine[];
  history: BetaMessageParam[];
  busy: boolean;
  draft: string;
}
let chat: ChatState = { lines: [], history: [], busy: false, draft: "" };
const subs = new Set<() => void>();
const setChat = (patch: Partial<ChatState>) => {
  chat = { ...chat, ...patch };
  subs.forEach((f) => f());
};
const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
};

/* Speech recognition, where the browser has it (Chrome, Edge, Safari). */
type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
function recognizer(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let pendingAsk: string | null = null;
/** Queue a question from elsewhere in the app (a button, a card). */
export function queueAsk(text: string) {
  pendingAsk = text;
  subs.forEach((f) => f());
}

export function AssistantPanel() {
  const h = useHouse();
  const state = useSyncExternalStore(subscribe, () => chat, () => chat);
  const houseRef = useRef<House>(h);
  const logRef = useRef<HTMLDivElement>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Rec | null>(null);
  const [canTalk] = useState(() => !!recognizer());
  const [pin, setPin] = useState("");
  const [pinBad, setPinBad] = useState(false);

  useEffect(() => {
    houseRef.current = h;
  });

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [state.lines.length, state.busy]);

  const ready = !!h.config?.assistantReady;
  const member = !!h.config?.member;

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || chat.busy) return;
    setChat({ lines: [...chat.lines, { role: "user", text }], busy: true, draft: "" });
    try {
      const r = await askAssistant(() => houseRef.current, chat.history, text, () => {});
      setChat({ history: r.history, lines: [...chat.lines, { role: "assistant", text: r.reply, actions: r.actions }], busy: false });
    } catch (e) {
      if (e instanceof AssistantLocked) {
        setChat({ busy: false, lines: [...chat.lines, { role: "assistant", text: "Enter the family PIN below to unlock me on this device.", error: true }] });
        void h.a.loadConfig();
        return;
      }
      setChat({ busy: false, lines: [...chat.lines, { role: "assistant", text: errorText(e), error: true }] });
    }
  };

  // Questions queued from elsewhere.
  useEffect(() => {
    if (pendingAsk && ready && member && !state.busy) {
      const t = pendingAsk;
      pendingAsk = null;
      void send(t);
    }
  });

  const talk = () => {
    const R = recognizer();
    if (!R) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new R();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let text = "";
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      setChat({ draft: text });
      if (final) finalText = text;
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") h.a.notify("The microphone is blocked for this site. Allow it in the browser settings.", "err");
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (finalText.trim()) void send(finalText);
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const rooms = h.rooms.map((r) => r.name);
  const r0 = rooms[0] ?? "Living Room";
  const r1 = rooms[1] ?? rooms[0] ?? "Patio";
  const suggestions = [
    `Play some Eagles in the ${r0}`,
    `Turn the ${r1} up a little`,
    `What's playing on the ${r1}?`,
    h.scenes[0] ? `${h.scenes[0].name} time` : "Pause everything",
    "Pause everything",
  ];

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="ic">
          <Icon name="sparkle" />
        </span>
        <div>
          <h2>Ask</h2>
          <p>Play, pause, group, turn it up. Just say it.</p>
        </div>
        {state.lines.length ? (
          <button className="icon-btn sm" aria-label="New conversation" onClick={() => setChat({ lines: [], history: [], draft: "" })}>
            <Icon name="refresh" />
          </button>
        ) : null}
      </div>

      <div className="chat-log" ref={logRef} aria-live="polite">
        {!state.lines.length ? (
          <div className="msg assistant">
            Hi! Tell me what you want to hear and where. Something like “play Motown on the patio” or “turn the garage down.”
          </div>
        ) : null}
        {state.lines.map((l, i) => (
          <div key={i} className={cx("msg", l.role, l.error && "err")}>
            {l.text}
            {l.actions && l.actions.length ? (
              <div className="acts">
                {l.actions.map((a, j) => (
                  <span key={j}>
                    <Icon name="check" />
                    {a}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {state.busy ? (
          <div className="typing" aria-label="Thinking">
            <i />
            <i />
            <i />
          </div>
        ) : null}
      </div>

      {!ready ? (
        <div className="lock">The assistant switches on as soon as its key is added to the app. Everything else works now.</div>
      ) : !member ? (
        <div className="lock">
          Enter the family PIN once to unlock the assistant on this device.
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await h.a.submitPin(pin);
              setPinBad(!ok);
              if (ok) setPin("");
            }}
          >
            <input inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" aria-label="Family PIN" />
            <button className="btn gold sm" type="submit" disabled={!pin}>
              Unlock
            </button>
          </form>
          {pinBad ? <p className="hint">That PIN didn&apos;t match.</p> : null}
        </div>
      ) : (
        <>
          {!state.lines.length ? (
            <div className="suggest">
              {[...new Set(suggestions)].slice(0, 4).map((s) => (
                <button key={s} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send(state.draft);
            }}
          >
            <textarea
              rows={1}
              value={state.draft}
              placeholder={listening ? "Listening…" : "Ask for any song, any room"}
              onChange={(e) => setChat({ draft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(state.draft);
                }
              }}
              aria-label="Message"
            />
            {canTalk ? (
              <button type="button" className={cx("icon-btn mic", listening && "on")} onClick={talk} aria-label={listening ? "Stop listening" : "Talk"}>
                <Icon name="mic" />
              </button>
            ) : null}
            <button type="submit" className="icon-btn send" disabled={!state.draft.trim() || state.busy} aria-label="Send">
              <Icon name="send" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
