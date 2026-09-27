"use client";

import { useState } from "react";
import type { PlayItem, RoomRef } from "@/lib/types";
import { NeedsSonosSetup, useHouse, whereOf } from "@/lib/house";
import { DEMO_FAV } from "@/lib/demo";
import { cx, errorText, listWords } from "@/lib/util";
import { Art } from "./Cover";
import { Icon } from "./Icons";
import { Spinner } from "./ui";
import { SonosSetupSteps } from "./SonosSetup";

/** Which rooms can play this item. */
function targetsFor(item: PlayItem, rooms: RoomRef[], spRooms: RoomRef[], live: boolean): RoomRef[] {
  if (item.type === "demo") return live ? [] : rooms;
  if (item.type === "sonos-favorite" || item.type === "sonos-playlist") return rooms.filter((r) => r.kind === "sonos");
  return [...(live ? rooms : []), ...spRooms];
}

export function PlayOnSheet({
  sheet,
  onClose,
  onPlayed,
}: {
  sheet: { item: PlayItem; rooms: string[] } | null;
  onClose: () => void;
  onPlayed?: () => void;
}) {
  const open = !!sheet;
  return (
    <div className={cx("sheet-wrap", open && "open")} onClick={onClose} inert={!open} aria-hidden={!open}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Choose rooms">
        <div className="grab" aria-hidden="true" />
        {sheet ? (
          <SheetBody
            key={sheet.item.title + sheet.rooms.join()}
            item={sheet.item}
            preselect={sheet.rooms}
            onClose={() => {
              onClose();
            }}
            onPlayed={onPlayed}
          />
        ) : null}
      </div>
    </div>
  );
}

function SheetBody({ item, preselect, onClose, onPlayed }: { item: PlayItem; preselect: string[]; onClose: () => void; onPlayed?: () => void }) {
  const h = useHouse();
  const targets = targetsFor(item, h.rooms, h.spotifyRooms, h.live);
  const ids = targets.map((t) => t.id);
  const [sel, setSel] = useState<Set<string>>(() => {
    const pre = preselect.filter((id) => ids.includes(id));
    if (pre.length) return new Set(pre);
    const f = h.focusRoom && ids.includes(h.focusRoom) ? [h.focusRoom] : [];
    if (f.length) return new Set(f);
    return new Set(ids.length === 1 ? ids : []);
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  const chosen = targets.filter((t) => sel.has(t.id));
  const sonosCount = targets.filter((t) => t.kind !== "spotify").length;
  const allSel = sonosCount > 0 && targets.filter((t) => t.kind !== "spotify").every((t) => sel.has(t.id));
  const label = !chosen.length
    ? "Pick a room"
    : allSel && chosen.length === sonosCount && sonosCount > 1
      ? "Play in every room"
      : "Play " + listWords(chosen.map((c) => whereOf(c.name)));

  const cover =
    item.type === "demo" ? (
      <Art artKey={DEMO_FAV[item.favId]?.art} />
    ) : item.type === "spotify" || item.type === "sonos-favorite" ? (
      <Art src={item.art} label={item.title} />
    ) : (
      <Art label={item.title} />
    );

  const toggle = (id: string) => {
    setErr(null);
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const go = async () => {
    if (!chosen.length) return;
    setBusy(true);
    setErr(null);
    try {
      const msg = await h.a.play(item, chosen.map((c) => c.id));
      h.a.notify(msg);
      onPlayed?.();
      onClose();
    } catch (e) {
      if (e instanceof NeedsSonosSetup) setNeedsSetup(true);
      else setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const spSelected = chosen.filter((c) => c.kind === "spotify");
  const sameAccountTwice =
    spSelected.length > 1 && new Set(spSelected.map((c) => c.id.split(":")[1])).size < spSelected.length;

  if (needsSetup) {
    return (
      <>
        <div className="s-head">
          <span className="cover">{cover}</span>
          <span>
            <b>One time: let Sonos play any song</b>
            <small>
              {item.title} is waiting for {listWords(chosen.map((c) => c.name))}
            </small>
          </span>
        </div>
        <p className="set-note" style={{ marginTop: 0 }}>
          Sonos only lets apps start its favorites. So the app keeps one Spotify playlist, fills it with what you pick, and starts it in
          the room. Set it up once and every song works in every room.
        </p>
        <SonosSetupSteps
          seed={item}
          readyLabel="Play now"
          onReady={() => {
            setNeedsSetup(false);
            void go();
          }}
        />
        <button className="linkbtn" style={{ display: "block", margin: "10px auto 0" }} onClick={() => setNeedsSetup(false)}>
          Back to rooms
        </button>
      </>
    );
  }

  return (
    <>
      <div className="s-head">
        <span className="cover">{cover}</span>
        <span>
          <b>{item.title}</b>
          <small>{item.subtitle}</small>
        </span>
      </div>

      {!targets.length ? (
        <p className="s-warn">
          {item.type === "demo"
            ? "Dad's real Sonos is linked, so the example favorites are retired. Pick one of his real ones."
            : item.type === "spotify"
              ? "Nowhere to play this yet. Link Dad's Sonos, or turn on This device in Settings to play it here."
              : "Link Dad's Sonos to play his favorites."}
        </p>
      ) : (
        <>
          <div className="s-row">
            <span>Play on</span>
            {sonosCount > 1 ? (
              <button
                className="linkbtn"
                onClick={() =>
                  setSel(allSel ? new Set() : new Set(targets.filter((t) => t.kind !== "spotify").map((t) => t.id)))
                }
              >
                {allSel ? "Clear" : "Every room"}
              </button>
            ) : null}
          </div>
          {targets.map((r) => (
            <button key={r.id} className="pick" aria-pressed={sel.has(r.id)} onClick={() => toggle(r.id)}>
              <span>
                <b>
                  {r.name}
                  {r.kind === "spotify" ? <span className="tag" style={{ marginLeft: 8 }}>Spotify</span> : null}
                </b>
                <small>{r.status}</small>
              </span>
              <span className="box">
                <Icon name="check" />
              </span>
            </button>
          ))}
        </>
      )}

      {sameAccountTwice ? (
        <p className="s-warn">One Spotify account plays on one speaker at a time, so only the last one will keep playing.</p>
      ) : null}
      {err ? <p className="s-warn">{err}</p> : null}

      <button className="primary" onClick={go} disabled={!chosen.length || busy}>
        {busy ? <Spinner /> : null}
        {busy ? "Starting…" : label}
      </button>
      <p className="s-note">
        {chosen.length > 1 ? "These rooms play in sync. Rooms you leave out keep their own music." : "Every other room keeps playing its own music."}
      </p>
    </>
  );
}
