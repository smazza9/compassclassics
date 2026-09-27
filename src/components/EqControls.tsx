"use client";

import { useEffect, type CSSProperties } from "react";
import type { EqState } from "@/lib/types";
import { useHouse } from "@/lib/house";
import { Icon } from "./Icons";

const PRESETS: { name: string; eq: Partial<EqState> }[] = [
  { name: "Flat", eq: { bass: 0, treble: 0, loudness: true, subGain: 0 } },
  { name: "Classic Rock", eq: { bass: 3, treble: 2, loudness: true, subGain: 2 } },
  { name: "Vocals", eq: { bass: -1, treble: 3, loudness: true, subGain: 0 } },
  { name: "Bass Boost", eq: { bass: 6, treble: 1, loudness: true, subGain: 5 } },
  { name: "Late Night", eq: { bass: -2, treble: 0, loudness: false, subGain: -4, nightMode: true } },
];

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const span = max - min;
  const pos = ((value - min) / span) * 100;
  const lo = Math.min(50, pos);
  const hi = Math.max(50, pos);
  return (
    <label className="eq-row">
      <span>{label}</span>
      <input
        type="range"
        className="center"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={label}
        style={{ "--lo": lo + "%", "--hi": hi + "%", "--v": pos + "%" } as CSSProperties}
        onChange={(e) => onChange(+e.target.value)}
      />
      <output>{value > 0 ? "+" + value : value}</output>
    </label>
  );
}

export function EqControls({ roomId }: { roomId: string }) {
  const h = useHouse();
  const can = h.a.canEq(roomId);
  const eq = h.a.eqFor(roomId);

  useEffect(() => {
    if (can && !eq) void h.a.loadEq(roomId);
  }, [can, eq, roomId, h.a]);

  if (!can) {
    return (
      <p className="hint">
        Bass, treble and the subwoofer need the home hub, a small program on a computer at the house. Settings, then Home hub,
        explains it.
      </p>
    );
  }
  if (!eq) {
    return (
      <div className="loading">
        <span className="spin" /> Reading the sound settings…
      </div>
    );
  }
  const set = (patch: Partial<EqState>) => h.a.setEq(roomId, patch);
  const apply = (p: Partial<EqState>) => {
    const patch: Partial<EqState> = { ...p };
    if (eq.subGain == null) delete patch.subGain;
    if (eq.nightMode == null) delete patch.nightMode;
    else if (patch.nightMode === undefined) patch.nightMode = false;
    set(patch);
  };
  return (
    <div>
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.name} className="preset" onClick={() => apply(p.eq)}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="eq-grid">
        <Slider label="Bass" value={eq.bass} min={-10} max={10} onChange={(v) => set({ bass: v })} />
        <Slider label="Treble" value={eq.treble} min={-10} max={10} onChange={(v) => set({ treble: v })} />
        {eq.subGain != null ? <Slider label="Subwoofer" value={eq.subGain} min={-15} max={15} onChange={(v) => set({ subGain: v })} /> : null}
      </div>
      <div className="eq-toggles">
        <button className="chip" aria-pressed={eq.loudness} onClick={() => set({ loudness: !eq.loudness })}>
          <Icon name={eq.loudness ? "check" : "plus"} />
          Loudness
        </button>
        {eq.subEnabled != null ? (
          <button className="chip" aria-pressed={!!eq.subEnabled} onClick={() => set({ subEnabled: !eq.subEnabled })}>
            <Icon name={eq.subEnabled ? "check" : "plus"} />
            Sub on
          </button>
        ) : null}
        {eq.nightMode != null ? (
          <button className="chip" aria-pressed={!!eq.nightMode} onClick={() => set({ nightMode: !eq.nightMode })}>
            <Icon name={eq.nightMode ? "check" : "moon"} />
            Night sound
          </button>
        ) : null}
        {eq.dialogLevel != null ? (
          <button className="chip" aria-pressed={!!eq.dialogLevel} onClick={() => set({ dialogLevel: !eq.dialogLevel })}>
            <Icon name={eq.dialogLevel ? "check" : "plus"} />
            Clear voices
          </button>
        ) : null}
      </div>
    </div>
  );
}
