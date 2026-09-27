"use client";

import { createContext, useContext, useEffect, useState, type CSSProperties } from "react";
import type { PlayItem, Zone } from "@/lib/types";
import { useNow } from "@/lib/hooks";
import { cx, fmtMs } from "@/lib/util";
import { EqBars, Icon, Needle } from "./Icons";
import { useHouse } from "@/lib/house";

/* ---------- UI state shared by the screens ---------- */

export type View = "home" | "music" | "ask" | "settings";

export interface UI {
  view: View;
  go(view: View): void;
  openDetail(zoneKey: string): void;
  closeDetail(): void;
  openSheet(item: PlayItem, rooms?: string[]): void;
  /** Rooms we're choosing music for ("Pick different music"). */
  pick: string[] | null;
  pickFor(rooms: string[] | null): void;
  /** Where a tapped song plays in Music. Empty means ask each time. */
  target: string[];
  setTarget(ids: string[]): void;
  ask(text: string): void;
}

export const UICtx = createContext<UI | null>(null);
export function useUI(): UI {
  const u = useContext(UICtx);
  if (!u) throw new Error("useUI outside the shell");
  return u;
}

/* ---------- small pieces ---------- */

export function Mark({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Needle className={cx("mark", className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={cx("mark", className)} src="/brand/mark-256.webp" alt="" onError={() => setFailed(true)} />;
}

export function Rose({ className }: { className?: string }) {
  return (
    <svg className={className ?? "rose"} viewBox="-100 -100 200 200" aria-hidden="true">
      <circle r="97" fill="none" stroke="currentColor" strokeWidth="0.7" />
      <circle r="89" fill="none" stroke="currentColor" strokeWidth="0.35" />
      <circle r="52" fill="none" stroke="currentColor" strokeWidth="0.5" />
      <g fill="currentColor">
        {[0, 90, 180, 270].map((r) => (
          <path key={r} d="M0 -93 8 -8 0 0 -8 -8Z" transform={`rotate(${r})`} />
        ))}
        {[45, 135, 225, 315].map((r) => (
          <path key={r} d="M0 -62 5 -5 0 0 -5 -5Z" transform={`rotate(${r})`} />
        ))}
      </g>
    </svg>
  );
}

export function Pill({ on }: { on: boolean }) {
  return on ? (
    <span className="pill on">
      <EqBars />
      Playing
    </span>
  ) : (
    <span className="pill off">Paused</span>
  );
}

export function Progress({ zone, big }: { zone: Zone; big?: boolean }) {
  const now = useNow();
  const t = zone.track;
  if (!t) return null;
  if (t.live || !t.durationMs) {
    return (
      <div className="prog live">
        <span className="livepill">LIVE</span>Streaming live, no end time
      </div>
    );
  }
  let pos = zone.positionMs ?? 0;
  if (zone.kind !== "demo" && zone.playing && zone.positionAt && now > zone.positionAt) pos += now - zone.positionAt;
  pos = Math.min(pos, t.durationMs);
  const pct = Math.max(0, Math.min(100, (pos / t.durationMs) * 100));
  return (
    <div className={cx("prog", big && "big")}>
      <div className="bar">
        <i style={{ width: pct.toFixed(2) + "%" }} />
      </div>
      <div className="times">
        <span>{fmtMs(pos)}</span>
        <span>{fmtMs(t.durationMs)}</span>
      </div>
    </div>
  );
}

export function Vol({ roomId, name, value }: { roomId: string; name: string; value: number }) {
  const h = useHouse();
  return (
    <>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        aria-label={name + " volume"}
        style={{ "--v": value + "%" } as CSSProperties}
        onChange={(e) => h.a.setVolume(roomId, +e.target.value)}
      />
      <output>{value}</output>
    </>
  );
}

export function Toast() {
  const { toast } = useHouse();
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    const a = setTimeout(() => setShown(toast.id), 0);
    const b = setTimeout(() => setShown((s) => (s === toast.id ? null : s)), toast.tone === "err" ? 5200 : 3200);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [toast]);
  return (
    <div className={cx("toast", toast && shown === toast.id && "show", toast?.tone === "err" && "err")} role="status" aria-live="polite">
      {toast?.tone === "err" ? <Icon name="info" /> : <Needle />}
      <span>{toast?.msg}</span>
    </div>
  );
}

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}

/** "Tuesday evening at the house" */
export function greeting(now: number): string {
  if (!now) return "At the house";
  const d = new Date(now);
  const h = d.getHours();
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return d.toLocaleDateString("en-US", { weekday: "long" }) + " " + part + " at the house";
}
