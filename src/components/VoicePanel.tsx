"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useHouse, type House } from "@/lib/house";
import { VoiceSession, type VoiceStatus, type VoiceTurn } from "@/lib/voiceClient";
import { cx } from "@/lib/util";
import { Icon } from "./Icons";

/*
 * The talking assistant. One big button: tap it and talk. The session and the
 * conversation live outside the component, so switching tabs doesn't hang up.
 */

interface VoiceState {
  status: VoiceStatus;
  turns: VoiceTurn[];
  error: string | null;
  locked: boolean;
}
let state: VoiceState = { status: "idle", turns: [], error: null, locked: false };
const subs = new Set<() => void>();
const set = (patch: Partial<VoiceState>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};
const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
};

let houseGetter: () => House = () => {
  throw new Error("no house yet");
};
let session: VoiceSession | null = null;
function voice(): VoiceSession {
  if (!session) {
    session = new VoiceSession({
      getHouse: () => houseGetter(),
      onStatus: (s) => set({ status: s }),
      onTurns: (t) => set({ turns: t }),
      onError: (e) => set({ error: e }),
      onLocked: () => set({ locked: true }),
    });
  }
  return session;
}

const LABEL: Record<VoiceStatus, string> = {
  idle: "Tap to talk",
  connecting: "Connecting…",
  listening: "Listening",
  speaking: "Talking",
  working: "On it…",
  error: "Tap to try again",
};

export function VoicePanel() {
  const h = useHouse();
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  const logRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [pin, setPin] = useState("");
  const [pinBad, setPinBad] = useState(false);

  useEffect(() => {
    houseGetter = () => h;
  });

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [s.turns.length, s.status]);

  const member = !!h.config?.member && !s.locked;
  const live = s.status !== "idle" && s.status !== "error";

  const tapTalk = () => {
    if (live) voice().stop();
    else void voice().start(true);
  };

  const sendText = (text: string) => {
    if (!text.trim()) return;
    voice().sendText(text);
    setDraft("");
  };

  const rooms = h.rooms.map((r) => r.name);
  const r0 = rooms[0] ?? "Living Room";
  const r1 = rooms[1] ?? r0;
  const suggestions = [`Play Whatever You Like by T.I. on the ${r1}`, `Turn the ${r0} up a little`, `What's playing on the ${r1}?`, "Pause everything"];

  return (
    <div className="chat voice">
      <div className="chat-head">
        <span className="ic">
          <Icon name="sparkle" />
        </span>
        <div>
          <h2>Ask</h2>
          <p>Tap the button and just say it. It talks back.</p>
        </div>
        {s.turns.length ? (
          <button className="icon-btn sm" aria-label="Clear" onClick={() => voice().clear()}>
            <Icon name="refresh" />
          </button>
        ) : null}
      </div>

      {!member ? (
        <div className="lock">
          Enter the family PIN once to unlock the assistant on this device.
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await h.a.submitPin(pin);
              setPinBad(!ok);
              if (ok) {
                setPin("");
                set({ locked: false });
              }
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
          <div className="talk-wrap">
            <button className={cx("talk", "st-" + s.status)} onClick={tapTalk} aria-label={live ? "End the conversation" : "Talk"}>
              <span className="ring" aria-hidden="true" />
              <span className="ring r2" aria-hidden="true" />
              <Icon name={live ? (s.status === "working" ? "sparkle" : "mic") : "mic"} />
            </button>
            <div className="talk-label">
              <b>{LABEL[s.status]}</b>
              <small>{live ? "Tap again to hang up" : "Say something like “play Hotel California in the living room”"}</small>
            </div>
          </div>

          {s.error ? <p className="s-warn" style={{ margin: "0 20px 8px" }}>{s.error}</p> : null}

          <div className="chat-log" ref={logRef} aria-live="polite">
            {s.turns.map((t) =>
              t.role === "action" ? (
                <div key={t.id} className={cx("act-line", t.error && "err")}>
                  <Icon name={t.error ? "info" : "check"} />
                  {t.text}
                </div>
              ) : (
                <div key={t.id} className={cx("msg", t.role)}>
                  {t.text}
                </div>
              ),
            )}
          </div>

          {!s.turns.length ? (
            <div className="suggest">
              {suggestions.map((q) => (
                <button key={q} onClick={() => sendText(q)}>
                  {q}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              sendText(draft);
            }}
          >
            <textarea
              rows={1}
              value={draft}
              placeholder="Or type it"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendText(draft);
                }
              }}
              aria-label="Type a request"
            />
            <button type="submit" className="icon-btn send" disabled={!draft.trim()} aria-label="Send">
              <Icon name="send" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
