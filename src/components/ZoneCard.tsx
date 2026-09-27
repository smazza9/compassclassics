"use client";

import type { CSSProperties } from "react";
import type { Zone } from "@/lib/types";
import { useHouse } from "@/lib/house";
import { useGlow } from "@/lib/glow";
import { cx } from "@/lib/util";
import { Art } from "./Cover";
import { Icon } from "./Icons";
import { Pill, Progress, Vol, useUI } from "./ui";

export function ZoneCard({ zone }: { zone: Zone }) {
  const h = useHouse();
  const ui = useUI();
  const glow = useGlow(zone.glowSeed);
  const grouped = zone.roomIds.length > 1;
  const t = zone.track;
  const lead = zone.members[0];

  return (
    <article
      className={cx("room", zone.playing ? "is-on" : "is-paused", grouped && "is-group")}
      style={{ "--glow": glow } as CSSProperties}
      data-zone={zone.key}
    >
      <div className="room-head">
        <div className="room-id">
          <h2 className="room-name">{zone.name}</h2>
          <p className="room-sub">{zone.sub}</p>
        </div>
        <Pill on={zone.playing} />
      </div>

      <button className="now" onClick={() => ui.openDetail(zone.key)} aria-label={"Open " + zone.name}>
        {t ? (
          <span className="art">
            <Art src={t.art} artKey={t.artKey} label={t.album ?? t.title} />
          </span>
        ) : (
          <span className="quiet-art">
            <Icon name="music" />
          </span>
        )}
        <span className="now-text">
          <span className="track">{t ? t.title : "Nothing playing"}</span>
          <span className="artist">{t ? t.artist || " " : "Tap to pick music"}</span>
          {zone.source ? <span className="from">{zone.source}</span> : null}
        </span>
        <span className="chev">
          <Icon name="chevR" />
        </span>
      </button>

      {t ? <Progress zone={zone} /> : null}

      <div className="ctl">
        <div className="transport">
          <button className="tbtn" onClick={() => h.a.step(zone.key, -1)} aria-label={"Previous song, " + zone.name} disabled={!t}>
            <Icon name="prev" />
          </button>
          <button
            className="pbtn"
            onClick={() => (t ? h.a.toggle(zone.key) : ui.pickFor(zone.roomIds))}
            aria-label={(zone.playing ? "Pause " : "Play ") + zone.name}
          >
            <Icon name={zone.playing ? "pause" : "play"} />
          </button>
          <button className="tbtn" onClick={() => h.a.step(zone.key, 1)} aria-label={"Next song, " + zone.name} disabled={!t}>
            <Icon name="next" />
          </button>
        </div>
        {grouped ? (
          <button className="chip-btn" onClick={() => h.a.split(zone.key)}>
            <Icon name="split" />
            Split rooms
          </button>
        ) : lead ? (
          <label className="vol">
            <Icon name={lead.muted ? "mute" : "speaker"} />
            <Vol roomId={lead.roomId} name={lead.name} value={lead.volume} />
          </label>
        ) : null}
      </div>

      {grouped ? (
        <div className="members">
          {zone.members.map((m) => (
            <div className="member" key={m.roomId}>
              <span>{m.name}</span>
              <Vol roomId={m.roomId} name={m.name} value={m.volume} />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
