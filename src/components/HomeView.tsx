"use client";

import { useState } from "react";
import { useHouse } from "@/lib/house";
import { useNow } from "@/lib/hooks";
import { cx, errorText } from "@/lib/util";
import { Icon } from "./Icons";
import { ZoneCard } from "./ZoneCard";
import { greeting, useUI } from "./ui";

export function HomeView() {
  const h = useHouse();
  const ui = useUI();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);

  const all = [...h.zones, ...h.spotifyZones];
  const on = all.filter((z) => z.playing);
  const nOn = on.reduce((n, z) => n + z.roomIds.length, 0);
  const songs = new Set(on.map((z) => (z.track ? z.track.title + "|" + z.track.artist : z.key))).size;
  let head: React.ReactNode;
  let sub: string;
  if (!nOn) {
    head = "All quiet";
    sub = "Every room is paused. Pick a scene, press play in any room, or ask.";
  } else {
    head = (
      <>
        <b>{nOn}</b> {nOn === 1 ? "room" : "rooms"} playing
      </>
    );
    sub = songs > 1 ? songs + " different songs right now" : nOn > 1 ? "Every room in sync" : "The other rooms are quiet";
  }

  const runScene = async (id: string) => {
    setBusy(id);
    try {
      const msg = await h.a.runScene(id);
      h.a.notify(msg);
    } catch (e) {
      h.a.notify(errorText(e), "err");
    } finally {
      setBusy(null);
    }
  };

  const linkSonos = () => {
    if (h.config?.sonosReady) location.assign("/api/sonos/login");
    else ui.go("settings");
  };

  return (
    <div className="view">
      <p className="greet">{greeting(now)}</p>
      <h1 className="headline">{head}</h1>
      <p className="subline">{sub}</p>

      {!h.live && h.config && !h.config.sonosLinked ? (
        <div className="banner">
          <span className="dot" aria-hidden="true" />
          <div>
            <b>Example house</b>
            These rooms are pretend so you can try everything. Link Dad&apos;s Sonos and his real rooms show up right here.
          </div>
          <button className="btn sm gold go" onClick={linkSonos}>
            <Icon name="link" />
            Link Sonos
          </button>
        </div>
      ) : null}
      {h.sonosError ? (
        <div className="banner err">
          <div>
            <b>Sonos</b>
            {h.sonosError}
          </div>
          <button className="btn sm go" onClick={() => h.a.refreshSonos()}>
            <Icon name="refresh" />
            Retry
          </button>
        </div>
      ) : null}
      {h.config?.sonosLinked && !h.snap && !h.sonosError ? (
        <div className="loading">
          <span className="spin" /> Finding the rooms…
        </div>
      ) : null}

      <div className="scenes" aria-label="Scenes">
        {h.scenes.map((sc) => (
          <button key={sc.id} className={cx("scene", busy === sc.id && "busy")} onClick={() => runScene(sc.id)} disabled={!!busy}>
            <span className="ic">
              <Icon name={sc.icon} />
            </span>
            <span>
              <b>{sc.name}</b>
              <small>{sc.note}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="cards">
        {h.zones.map((z) => (
          <ZoneCard key={z.key} zone={z} />
        ))}
      </div>

      {h.accounts.length ? (
        <>
          <div className="section-label">
            <span>Spotify speakers</span>
            <button onClick={() => h.a.refreshSpotify(true)}>Refresh</button>
          </div>
          {h.spotifyZones.length ? (
            <div className="cards">
              {h.spotifyZones.map((z) => (
                <ZoneCard key={z.key} zone={z} />
              ))}
            </div>
          ) : (
            <p className="empty">
              No Spotify speakers are awake. Open Spotify on a phone, computer or receiver, or turn on <b>This device</b> in Settings
              to play right here.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
