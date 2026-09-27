"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useHouse } from "@/lib/house";
import { useGlow } from "@/lib/glow";
import { cx, fmtMs } from "@/lib/util";
import { Art } from "./Cover";
import { EqControls } from "./EqControls";
import { Icon } from "./Icons";
import { Pill, Progress, Vol, useUI } from "./ui";

export function RoomDetail({ roomId }: { roomId: string | null }) {
  const h = useHouse();
  const ui = useUI();
  const scroller = useRef<HTMLDivElement>(null);
  const all = [...h.zones, ...h.spotifyZones];
  // Follow the room, not the group: groups change ids when rooms join or leave.
  const zone = roomId ? all.find((z) => z.roomIds.includes(roomId)) : undefined;
  useEffect(() => {
    if (roomId && scroller.current) scroller.current.scrollTop = 0;
    if (roomId) h.a.setFocus(roomId);
  }, [roomId, h.a]);

  const glow = useGlow(zone?.glowSeed ?? "navy");
  const open = !!roomId && !!zone;
  const t = zone?.track;
  const isDemo = zone?.kind === "demo";
  const others = zone ? h.rooms.filter((r) => zone.kind !== "spotify" && r.kind === zone.kind && r.id !== zone.roomIds[0]) : [];
  const shuffleOn = zone?.kind === "demo" ? h.demo.shuffle : zone?.kind === "sonos" ? !!h.snap?.playback[zone.id]?.playModes?.shuffle : false;

  return (
    <>
      <div className={cx("detail-scrim", open && "open")} onClick={ui.closeDetail} aria-hidden="true" />
      <div
        className={cx("detail", open && "open")}
        role="dialog"
        aria-label={zone?.name ?? "Room"}
        aria-hidden={!open}
        style={{ "--glow": glow } as CSSProperties}
        inert={!open}
      >
        {zone ? (
          <>
            <div className="d-top">
              <button className="icon-btn" onClick={ui.closeDetail} aria-label="Back to rooms">
                <Icon name="chevL" />
              </button>
              <div className="d-title">
                <div className="d-name">{zone.name}</div>
                <div className="room-sub">{zone.sub}</div>
              </div>
              <Pill on={zone.playing} />
            </div>
            <div className="d-scroll" ref={scroller}>
              <div className="d-art">
                {t ? (
                  <Art src={t.art} artKey={t.artKey} label={t.album ?? t.title} words />
                ) : (
                  <div className="quiet-art" style={{ width: "100%", height: "100%" }}>
                    <Icon name="music" />
                  </div>
                )}
              </div>
              <div className="d-track">{t ? t.title : "Nothing playing"}</div>
              <div className="d-artist">{t ? t.artist : "Pick some music below"}</div>
              {zone.source ? <div className="d-from">From {zone.source}</div> : null}
              {t ? <Progress zone={zone} big /> : null}

              <div className="d-ctl">
                <button
                  className={cx("tbtn", shuffleOn && "lit")}
                  onClick={() => h.a.toggleShuffle(zone.key)}
                  aria-pressed={shuffleOn}
                  aria-label="Shuffle"
                  disabled={zone.kind === "spotify"}
                >
                  <Icon name="shuffle" />
                </button>
                <button className="tbtn lg" onClick={() => h.a.step(zone.key, -1)} aria-label="Previous song" disabled={!t}>
                  <Icon name="prev" />
                </button>
                <button
                  className="pbtn xl"
                  onClick={() => (t ? h.a.toggle(zone.key) : ui.pickFor(zone.roomIds))}
                  aria-label={zone.playing ? "Pause" : "Play"}
                >
                  <Icon name={zone.playing ? "pause" : "play"} />
                </button>
                <button className="tbtn lg" onClick={() => h.a.step(zone.key, 1)} aria-label="Next song" disabled={!t}>
                  <Icon name="next" />
                </button>
                <button className="tbtn" onClick={() => ui.pickFor(zone.roomIds)} aria-label="Pick different music">
                  <Icon name="search" />
                </button>
              </div>

              <section className="d-sec">
                <h3 className="d-label">Volume</h3>
                {zone.members.map((m) => (
                  <div className="member" key={m.roomId}>
                    <span>{m.name}</span>
                    <Vol roomId={m.roomId} name={m.name} value={m.volume} />
                  </div>
                ))}
              </section>

              {others.length ? (
                <section className="d-sec">
                  <h3 className="d-label">Play here too</h3>
                  <div className="chips">
                    {others.map((r) => {
                      const inG = zone.roomIds.includes(r.id);
                      return (
                        <button key={r.id} className={cx("chip", inG && "in")} aria-pressed={inG} onClick={() => h.a.toggleMember(zone.key, r.id)}>
                          <Icon name={inG ? "check" : "plus"} />
                          {r.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="hint">Rooms you add play the same song in sync. Tap one again to give it its own music back.</p>
                </section>
              ) : null}

              {zone.upNext.length ? (
                <section className="d-sec">
                  <h3 className="d-label">Up next</h3>
                  <ul className="queue">
                    {zone.upNext.map((q, i) => (
                      <li key={i}>
                        <button
                          className="q"
                          onClick={() => {
                            if (isDemo && q.index != null) h.a.jump(zone.key, q.index);
                            else if (i === 0) h.a.step(zone.key, 1);
                          }}
                        >
                          <span className="q-t">{q.title}</span>
                          <span className="q-a">{q.artist}</span>
                          <span className="q-d">{q.durationMs ? fmtMs(q.durationMs) : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {zone.kind !== "spotify" ? (
                <section className="d-sec">
                  <h3 className="d-label">Sound</h3>
                  <EqControls roomId={zone.roomIds[0]} />
                </section>
              ) : null}

              <section className="d-sec">
                <h3 className="d-label">Speakers</h3>
                <ul className="spk">
                  {zone.speakers.map((s, i) => (
                    <li key={i}>
                      <Icon name="speaker" />
                      <span>{s.name}</span>
                      <small>{s.room}</small>
                    </li>
                  ))}
                </ul>
              </section>

              <button className="secondary" onClick={() => ui.pickFor(zone.roomIds)}>
                <Icon name="music" />
                Pick different music
              </button>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
