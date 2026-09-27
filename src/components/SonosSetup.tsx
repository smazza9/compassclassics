"use client";

import { useState } from "react";
import type { PlayItem } from "@/lib/types";
import { useHouse } from "@/lib/house";
import { errorText } from "@/lib/util";
import { Icon } from "./Icons";
import { Spinner } from "./ui";

/*
 * The one-time step that lets any song play on Sonos. Sonos only starts its
 * own favorites, so the app keeps one Spotify playlist, "Compass Classics",
 * refills it with whatever Dad picks, and starts that favorite in the room.
 */
export function SonosSetupSteps({ seed, onReady, readyLabel = "Check" }: { seed?: PlayItem; onReady?: () => void; readyLabel?: string }) {
  const h = useHouse();
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const who = h.primary?.name ?? "Dad";

  const make = async () => {
    setMaking(true);
    setNote(null);
    try {
      await h.a.setupSonosPlaylist(seed);
      setMade(true);
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setMaking(false);
    }
  };

  const check = async () => {
    setChecking(true);
    setNote(null);
    try {
      await h.a.loadFavorites(true);
      if (h.a.sonosSetup().ready) {
        if (onReady) onReady();
        else h.a.notify("All set. Any song now plays in any room.");
      } else {
        setNote("Sonos doesn't show it in favorites yet. Once it's added there, tap " + readyLabel + " again.");
      }
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="setup">
      <ol className="steps">
        <li>
          <button className="btn sm gold" onClick={make} disabled={making || !h.primary}>
            {making ? <Spinner /> : <Icon name={made ? "check" : "plus"} />}
            {made ? "Playlist ready" : "Make the playlist"}
          </button>
          <span className="hint" style={{ display: "block" }}>
            A playlist called <b>Compass Classics</b> in {who}&apos;s Spotify. Leave it there.
          </span>
        </li>
        <li>
          In the <b>Sonos app</b>, search <b>Compass Classics</b> (or Browse, Spotify, Your Library, Playlists) and open it. Tap the{" "}
          <b>three dots</b>, then <b>Add to Favorites</b> (older app: Add to My Sonos).
        </li>
        <li>
          Come back here and tap <b>{readyLabel}</b>. That&apos;s it, forever: any song, any room.
        </li>
      </ol>
      {note ? <p className="s-warn">{note}</p> : null}
      <button className="primary" onClick={check} disabled={checking}>
        {checking ? <Spinner /> : <Icon name="play" />}
        {checking ? "Checking…" : readyLabel}
      </button>
    </div>
  );
}
