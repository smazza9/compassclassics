"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayItem } from "@/lib/types";
import { useHouse } from "@/lib/house";
import { useMedia } from "@/lib/hooks";
import { cx } from "@/lib/util";
import { AssistantPanel, queueAsk } from "./AssistantPanel";
import { HomeView } from "./HomeView";
import { Icon, Needle } from "./Icons";
import { MusicView } from "./MusicView";
import { PlayOnSheet } from "./PlayOnSheet";
import { RoomDetail } from "./RoomDetail";
import { SettingsView } from "./SettingsView";
import { Mark, Rose, Toast, UICtx, type UI, type View } from "./ui";

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "home", label: "Rooms", icon: "home" },
  { id: "music", label: "Music", icon: "music" },
  { id: "ask", label: "Ask", icon: "sparkle" },
  { id: "settings", label: "Settings", icon: "sliders" },
];

const RETURN_MSGS: Record<string, [string, "ok" | "err" | "info"]> = {
  linked: ["Dad's Sonos is linked. His rooms are loading.", "ok"],
  denied: ["Sonos sign in was cancelled.", "info"],
  expired: ["That Sonos sign in took too long. Try Link Sonos again.", "err"],
  failed: ["Sonos didn't accept the sign in. Try again in a minute.", "err"],
  notready: ["Sonos linking isn't switched on yet. It needs the Sonos developer key.", "info"],
};

export function Shell() {
  const h = useHouse();
  const wide = useMedia("(min-width: 1240px)");
  const [view, setView] = useState<View>(() => {
    const v = new URLSearchParams(location.search).get("view");
    return v === "settings" || v === "music" || v === "ask" ? v : "home";
  });
  const [detail, setDetail] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ item: PlayItem; rooms: string[] } | null>(null);
  const [pick, setPick] = useState<string[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const zonesRef = useRef([...h.zones, ...h.spotifyZones]);
  useEffect(() => {
    zonesRef.current = [...h.zones, ...h.spotifyZones];
  });

  // Messages from sign-in redirects, then tidy the address bar.
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const s = p.get("sonos");
    const spot = p.get("spotify");
    const t = setTimeout(() => {
      if (s && RETURN_MSGS[s]) h.a.notify(RETURN_MSGS[s][0], RETURN_MSGS[s][1]);
      if (spot === "linked") h.a.notify("Spotify is connected. Search is ready.");
    }, 350);
    if (p.size) history.replaceState(null, "", "/");
    return () => clearTimeout(t);
  }, [h.a]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (sheet) setSheet(null);
      else if (detail) setDetail(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet, detail]);

  const ui = useMemo<UI>(
    () => ({
      view,
      go: (v) => {
        setView(v);
        setDetail(null);
        scrollRef.current?.scrollTo({ top: 0 });
      },
      openDetail: (k) => {
        const z = [...zonesRef.current].find((x) => x.key === k);
        if (z) setDetail(z.roomIds[0]);
      },
      closeDetail: () => setDetail(null),
      openSheet: (item, rooms = []) => setSheet({ item, rooms }),
      pick,
      pickFor: (rooms) => {
        setPick(rooms);
        if (rooms) {
          setDetail(null);
          setView("music");
          scrollRef.current?.scrollTo({ top: 0 });
        }
      },
      ask: (text) => {
        queueAsk(text);
        if (!wide) setView("ask");
      },
    }),
    [view, pick, wide],
  );

  const main = view === "ask" && wide ? "home" : view;

  return (
    <UICtx.Provider value={ui}>
      <div className="shell">
        <Rose />
        <header className="topbar">
          <div className="brand">
            <Mark />
            <span>
              Compass <b>Classics</b>
            </span>
          </div>
          <button className="icon-btn" onClick={() => h.a.allOff()} aria-label="Pause every room">
            <Icon name="power" />
          </button>
        </header>

        <aside className="side" aria-label="Compass Classics">
          <div className="brand">
            <Mark />
            <span>
              Compass
              <br />
              <b>Classics</b>
            </span>
          </div>
          <nav className="side-nav" aria-label="Sections">
            {NAV.map((n) => (
              <button
                key={n.id}
                className={cx("side-link", n.id === "ask" && "ask-link")}
                aria-current={main === n.id ? "page" : undefined}
                onClick={() => ui.go(n.id)}
              >
                <Icon name={n.icon} />
                {n.label}
              </button>
            ))}
          </nav>
          <div className="side-rooms">
            <div className="section-label" style={{ margin: "0 12px 8px" }}>
              <span>Rooms</span>
            </div>
            {[...h.zones, ...h.spotifyZones].map((z) => (
              <button key={z.key} className={cx("side-room", z.playing && "on")} onClick={() => ui.openDetail(z.key)}>
                <i />
                <span>
                  <b>{z.name}</b>
                  <small>{z.playing && z.track ? z.track.title : z.track ? "Paused" : "Quiet"}</small>
                </span>
              </button>
            ))}
            <button className="side-link" style={{ marginTop: 10 }} onClick={() => h.a.allOff()}>
              <Icon name="power" />
              Pause everything
            </button>
          </div>
          <div className="side-foot">
            <Needle />
            Made for Dad by Stephen
          </div>
        </aside>

        <main className={cx("main", main === "ask" && "asking")}>
          <div className="scroll" ref={scrollRef}>
            {main === "home" ? <HomeView /> : null}
            {main === "music" ? <MusicView /> : null}
            {main === "settings" ? <SettingsView /> : null}
            {main === "ask" ? (
              <div className="view view-ask">
                <AssistantPanel />
              </div>
            ) : null}
          </div>
        </main>

        {wide ? (
          <aside className="panel" aria-label="Assistant">
            <AssistantPanel />
          </aside>
        ) : null}

        <nav className="tabs" aria-label="Sections">
          {NAV.map((n) => (
            <button key={n.id} className="tab" aria-current={main === n.id ? "page" : undefined} onClick={() => ui.go(n.id)}>
              <Icon name={n.icon} />
              {n.label}
            </button>
          ))}
        </nav>

        <RoomDetail roomId={detail} />
        <PlayOnSheet
          sheet={sheet}
          onClose={() => setSheet(null)}
          onPlayed={() => {
            if (pick) {
              setPick(null);
              ui.go("home");
            }
          }}
        />
        <Toast />
      </div>
    </UICtx.Provider>
  );
}
