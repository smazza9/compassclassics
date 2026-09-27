"use client";

import { useRef, useState } from "react";
import { useHouse } from "@/lib/house";
import { cx, errorText, listWords } from "@/lib/util";
import { Art } from "./Cover";
import { Icon } from "./Icons";
import { Spinner } from "./ui";

/**
 * "Add rooms": pick which rooms play along with one card's music. The lead
 * room stays, ticked rooms join in sync, unticked ones get their own music
 * back. Nothing changes until "Play together" is tapped, so it's one Sonos
 * call however many rooms move.
 */
export function GroupSheet({ roomId, onClose }: { roomId: string | null; onClose: () => void }) {
  const h = useHouse();
  // Follow the lead room, not the group: group ids change as rooms join or leave.
  const zone = roomId ? h.zones.find((z) => z.roomIds.includes(roomId)) : undefined;
  const open = !!roomId && !!zone;
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; dy: number } | null>(null);

  // Swipe down to close, same feel as the Play sheet.
  const onTouchStart = (e: React.TouchEvent) => {
    const el = ref.current;
    if (!el) return;
    const onHandle = !!(e.target as HTMLElement).closest(".grab, .s-head, .sheet-x");
    if (el.scrollTop > 0 && !onHandle) return;
    drag.current = { y0: e.touches[0].clientY, dy: 0 };
    el.style.transition = "none";
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    d.dy = Math.max(0, e.touches[0].clientY - d.y0);
    el.style.transform = d.dy ? "translateY(" + d.dy + "px)" : "";
  };
  const onTouchEnd = () => {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!el) return;
    el.style.transition = "";
    el.style.transform = "";
    if (d && d.dy > 80) onClose();
  };

  return (
    <div className={cx("sheet-wrap", open && "open")} onClick={onClose} inert={!open} aria-hidden={!open}>
      <div
        className="sheet"
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        role="dialog"
        aria-modal="true"
        aria-label="Add rooms"
      >
        <div className="grab" aria-hidden="true" />
        <button className="icon-btn sm sheet-x" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        {zone ? <Body key={zone.roomIds[0] + "|" + zone.roomIds.join()} zoneKey={zone.key} onClose={onClose} /> : null}
      </div>
    </div>
  );
}

function Body({ zoneKey, onClose }: { zoneKey: string; onClose: () => void }) {
  const h = useHouse();
  const zone = h.zones.find((z) => z.key === zoneKey)!;
  const lead = zone.roomIds[0];
  const rooms = h.rooms.filter((r) => r.kind === zone.kind);
  const others = rooms.filter((r) => r.id !== lead);
  const [sel, setSel] = useState<Set<string>>(() => new Set(zone.roomIds));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const chosen = rooms.filter((r) => sel.has(r.id));
  const allSel = others.every((r) => sel.has(r.id));
  const changed = chosen.length !== zone.roomIds.length || chosen.some((r) => !zone.roomIds.includes(r.id));
  const t = zone.track;
  const leadName = h.a.roomName(lead);
  const label = !changed
    ? "Pick rooms to add"
    : chosen.length === 1
      ? "Keep " + leadName + " on its own"
      : allSel && others.length > 1
        ? "Play in every room"
        : "Play together in " + chosen.length + " rooms";

  const toggle = (id: string) => {
    if (id === lead) return;
    setErr(null);
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const msg = await h.a.setGroup(zone.key, [...sel]);
      h.a.notify(msg);
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="s-head">
        <span className="cover">{t ? <Art src={t.art} artKey={t.artKey} label={t.album ?? t.title} /> : <Art label={leadName} />}</span>
        <span>
          <b>{t ? t.title : leadName}</b>
          <small>{t ? "Playing in " + listWords(zone.roomIds.map(h.a.roomName)) : "Nothing playing yet in " + leadName}</small>
        </span>
      </div>

      <div className="s-row">
        <span>Play together in</span>
        {others.length > 1 ? (
          <button className="linkbtn" onClick={() => setSel(allSel ? new Set([lead]) : new Set(rooms.map((r) => r.id)))}>
            {allSel ? "Just " + leadName : "Every room"}
          </button>
        ) : null}
      </div>
      {rooms.map((r) => {
        const isLead = r.id === lead;
        const on = sel.has(r.id);
        return (
          <button key={r.id} className="pick" aria-pressed={on} onClick={() => toggle(r.id)} disabled={isLead} style={isLead ? { opacity: 1 } : undefined}>
            <span>
              <b>
                {r.name}
                {isLead ? (
                  <span className="tag" style={{ marginLeft: 8 }}>
                    This room
                  </span>
                ) : null}
              </b>
              <small>
                {isLead
                  ? "Keeps what it's playing"
                  : on && !zone.roomIds.includes(r.id)
                    ? "Will join in sync"
                    : !on && zone.roomIds.includes(r.id)
                      ? zone.kind === "demo"
                        ? "Gets its own music back"
                        : "Leaves the group and goes quiet"
                      : r.status}
              </small>
            </span>
            <span className="box">
              <Icon name="check" />
            </span>
          </button>
        );
      })}

      {err ? <p className="s-warn">{err}</p> : null}

      <button className="primary" onClick={go} disabled={!changed || busy}>
        {busy ? <Spinner /> : <Icon name="link" />}
        {busy ? "Grouping…" : label}
      </button>
      <p className="s-note">Rooms you tick play the same song in sync with {leadName}. Untick one and it leaves the group. Other rooms aren&apos;t touched.</p>
    </>
  );
}
