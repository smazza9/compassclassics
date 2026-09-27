"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayItem } from "@/lib/types";
import { useHouse } from "@/lib/house";
import { errorText } from "@/lib/util";
import { Icon } from "./Icons";
import { Spinner } from "./ui";

/*
 * The one-time step that lets any song play on Sonos. Sonos only starts its
 * own favorites, so the app keeps one Spotify playlist, "Compass Classics",
 * refills it with whatever Dad picks, and starts that favorite in the room.
 * The app makes the playlist itself and watches for the favorite, so the only
 * thing a person does is "Add to Favorites" once in the Sonos app.
 */
export function SonosSetupSteps({ seed, onReady, readyLabel = "Check" }: { seed?: PlayItem; onReady?: () => void; readyLabel?: string }) {
  const h = useHouse();
  const [prep, setPrep] = useState<"making" | "ready" | "error">("making");
  const [note, setNote] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const done = useRef(false);
  const readyRef = useRef(onReady);
  useEffect(() => {
    readyRef.current = onReady;
  });
  const who = h.primary?.name ?? "Dad";
  const a = h.a;

  // Make (or refill) the playlist right away, loaded with the song he picked.
  useEffect(() => {
    let dead = false;
    a.setupSonosPlaylist(seed)
      .then(() => !dead && setPrep("ready"))
      .catch((e) => {
        if (dead) return;
        setPrep("error");
        setNote(errorText(e));
      });
    return () => {
      dead = true;
    };
  }, [a, seed]);

  // Watch Sonos favorites; the moment it's added, carry on by itself.
  useEffect(() => {
    const t = setInterval(async () => {
      if (done.current) return;
      try {
        await a.loadFavorites(true);
        if (a.sonosSetup().ready && !done.current) {
          done.current = true;
          if (readyRef.current) readyRef.current();
          else a.notify("All set. Any song now plays in any room.");
        }
      } catch {
        /* keep watching */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [a]);

  const check = async () => {
    setChecking(true);
    setNote(null);
    try {
      await a.loadFavorites(true);
      if (a.sonosSetup().ready) {
        done.current = true;
        if (onReady) onReady();
        else a.notify("All set. Any song now plays in any room.");
      } else {
        setNote("Not in Sonos favorites yet. It plays by itself as soon as it's added.");
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
          Open the <b>Sonos app</b>, then <b>Spotify</b>, <b>Your Library</b>, <b>Playlists</b>, and open <b>Compass Classics</b>
          {prep === "making" ? (
            <>
              {" "}
              <Spinner />
            </>
          ) : null}
          .
        </li>
        <li>
          Tap the <b>three dots</b>, then <b>Add to Favorites</b> (older app: Add to My Sonos).
        </li>
      </ol>
      <p className="hint" style={{ margin: "0 0 10px" }}>
        {prep === "ready"
          ? "The playlist is in " + who + "'s Spotify. Come back here after adding it and the music starts by itself."
          : prep === "making"
            ? "Getting the playlist ready in " + who + "'s Spotify…"
            : ""}
      </p>
      {note ? <p className="s-warn">{note}</p> : null}
      <button className="primary" onClick={check} disabled={checking}>
        {checking ? <Spinner /> : <Icon name="play" />}
        {checking ? "Checking…" : readyLabel}
      </button>
    </div>
  );
}
