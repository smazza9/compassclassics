"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlayItem } from "@/lib/types";
import { useHouse } from "@/lib/house";
import * as sp from "@/lib/spotify";
import { DEMO_FAVS } from "@/lib/demo";
import { cx, errorText, fmtMs, listWords, norm } from "@/lib/util";
import { Art } from "./Cover";
import { Icon } from "./Icons";
import { useUI } from "./ui";

type Filter = "all" | "track" | "artist" | "album" | "playlist";
type Drill =
  | { kind: "artist"; id: string; name: string; art?: string | null }
  | { kind: "album"; id: string; name: string; art?: string | null; sub?: string }
  | { kind: "playlist"; id: string; name: string; art?: string | null; sub?: string; mine?: boolean };

export function MusicView() {
  const h = useHouse();
  const ui = useUI();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [drill, setDrill] = useState<Drill[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const play = (item: PlayItem) => ui.openSheet(item, ui.pick ?? []);
  const open = (d: Drill) => setDrill((s) => [...s, d]);
  const top = drill[drill.length - 1];

  return (
    <div className="view">
      <h1 className="headline" style={{ marginTop: 6 }}>
        Music
      </h1>
      {ui.pick ? (
        <div className="pickbar">
          <span>Choosing music for {listWords(ui.pick.map(h.a.roomName))}</span>
          <button onClick={() => ui.pickFor(null)}>Cancel</button>
        </div>
      ) : null}

      {top ? (
        <>
          <button className="back" onClick={() => setDrill((s) => s.slice(0, -1))}>
            <Icon name="chevL" />
            Back
          </button>
          {top.kind === "artist" ? <ArtistPage d={top} play={play} open={open} /> : null}
          {top.kind === "album" ? <AlbumPage d={top} play={play} /> : null}
          {top.kind === "playlist" ? <PlaylistPage d={top} play={play} /> : null}
        </>
      ) : (
        <>
          <label className="search" htmlFor="search">
            <Icon name="search" />
            <input
              id="search"
              type="search"
              placeholder={h.primary ? "Search any song, artist or album" : "Search the favorites"}
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q ? (
              <button className="clear" onClick={() => setQ("")} aria-label="Clear search">
                <Icon name="close" />
              </button>
            ) : h.primary ? (
              <span className="tag">All of Spotify</span>
            ) : null}
          </label>
          {query ? (
            h.primary ? (
              <SpotifyResults key={query} query={query} play={play} open={open} />
            ) : (
              <DemoResults query={query} play={play} />
            )
          ) : (
            <Browse play={play} open={open} />
          )}
        </>
      )}
    </div>
  );
}

/* ---------- search results ---------- */

function SpotifyResults({ query, play, open }: { query: string; play: (i: PlayItem) => void; open: (d: Drill) => void }) {
  const h = useHouse();
  const acct = h.primary!;
  const [filter, setFilter] = useState<Filter>("all");
  const [res, setRes] = useState<sp.SearchResults | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [extra, setExtra] = useState<{ tracks: sp.SpTrack[]; loading: boolean; offset: number }>({ tracks: [], loading: false, offset: 10 });

  useEffect(() => {
    let dead = false;
    sp.search(acct, query)
      .then((r) => !dead && setRes(r))
      .catch((e) => !dead && setErr(errorText(e)));
    return () => {
      dead = true;
    };
  }, [acct, query]);

  const moreSongs = async () => {
    setExtra((x) => ({ ...x, loading: true }));
    try {
      const r = await sp.search(acct, query, ["track"], extra.offset);
      setExtra((x) => ({ tracks: [...x.tracks, ...r.tracks], loading: false, offset: x.offset + 10 }));
    } catch (e) {
      h.a.notify(errorText(e), "err");
      setExtra((x) => ({ ...x, loading: false }));
    }
  };

  if (err) return <p className="empty">{err}</p>;
  if (!res)
    return (
      <div className="loading">
        <span className="spin" /> Searching Spotify…
      </div>
    );
  const tracks = [...res.tracks, ...extra.tracks];
  const nothing = !res.tracks.length && !res.artists.length && !res.albums.length && !res.playlists.length;
  if (nothing) return <p className="empty">Nothing on Spotify matches “{query}”. Try fewer words, or just the artist.</p>;
  const show = (f: Filter) => filter === "all" || filter === f;

  return (
    <>
      <div className="filters" role="toolbar" aria-label="Filter results">
        {(
          [
            ["all", "All"],
            ["track", "Songs"],
            ["artist", "Artists"],
            ["album", "Albums"],
            ["playlist", "Playlists"],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button key={f} className="filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>

      {show("artist") && res.artists.length ? (
        <>
          <div className="label">
            <span>Artists</span>
          </div>
          <div className="grid">
            {res.artists.slice(0, filter === "all" ? 4 : 10).map((a) => (
              <button key={a.id} className="fav round" onClick={() => open({ kind: "artist", id: a.id, name: a.name, art: sp.img(a.images, true) })}>
                <span className="cover">
                  <Art src={sp.img(a.images, true)} label={a.name} />
                </span>
                <b>{a.name}</b>
                <small>Artist</small>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {show("track") && tracks.length ? (
        <>
          <div className="label">
            <span>Songs</span>
          </div>
          <div className={cx("results", filter === "track" && "two")}>
            {tracks.slice(0, filter === "all" ? 6 : 100).map((t) => (
              <SongRow key={t.id + t.uri} t={t} play={play} />
            ))}
          </div>
          {filter === "track" && extra.offset < 200 ? (
            <button className="secondary" onClick={moreSongs} disabled={extra.loading}>
              {extra.loading ? <span className="spin" /> : <Icon name="plus" />}
              More songs
            </button>
          ) : null}
        </>
      ) : null}

      {show("album") && res.albums.length ? (
        <>
          <div className="label">
            <span>Albums</span>
          </div>
          <div className="grid">
            {res.albums.slice(0, filter === "all" ? 4 : 10).map((a) => (
              <button
                key={a.id}
                className="fav"
                onClick={() =>
                  open({ kind: "album", id: a.id, name: a.name, art: sp.img(a.images, true), sub: a.artists.map((x) => x.name).join(", ") })
                }
              >
                <span className="cover">
                  <Art src={sp.img(a.images, true)} label={a.name} />
                </span>
                <b>{a.name}</b>
                <small>
                  {a.artists.map((x) => x.name).join(", ")}
                  {a.release_date ? " · " + a.release_date.slice(0, 4) : ""}
                </small>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {show("playlist") && res.playlists.length ? (
        <>
          <div className="label">
            <span>Playlists</span>
          </div>
          <div className="grid">
            {res.playlists.slice(0, filter === "all" ? 4 : 10).map((p) => (
              <button
                key={p.id}
                className="fav"
                onClick={() =>
                  open({
                    kind: "playlist",
                    id: p.id,
                    name: p.name,
                    art: sp.img(p.images, true),
                    sub: p.owner?.display_name,
                    mine: p.owner?.id === acct.id,
                  })
                }
              >
                <span className="cover">
                  <Art src={sp.img(p.images, true)} label={p.name} />
                </span>
                <b>{p.name}</b>
                <small>{p.owner?.display_name ?? "Playlist"}</small>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

function SongRow({ t, play, num }: { t: sp.SpTrack; play: (i: PlayItem) => void; num?: number }) {
  return (
    <button className="res" onClick={() => play(sp.trackToItem(t))}>
      {num != null ? (
        <span className="num">{num}</span>
      ) : (
        <span className="cover">
          <Art src={sp.img(t.album?.images, true)} label={t.album?.name ?? t.name} />
        </span>
      )}
      <span>
        <b>{t.name}</b>
        <small>
          {t.artists.map((a) => a.name).join(", ")}
          {t.album && num == null ? " · " + t.album.name : ""}
          {num != null ? " · " + fmtMs(t.duration_ms) : ""}
        </small>
      </span>
      <span className="go-play">Play</span>
    </button>
  );
}

function DemoResults({ query, play }: { query: string; play: (i: PlayItem) => void }) {
  const ui = useUI();
  const rows = useMemo(() => {
    const out: { fav: (typeof DEMO_FAVS)[number]; i: number }[] = [];
    const qq = norm(query);
    for (const f of DEMO_FAVS) {
      if (f.live) {
        if (norm(f.name).includes(qq)) out.push({ fav: f, i: 0 });
        continue;
      }
      f.tracks.forEach((t, i) => {
        if (norm(t[0] + " " + t[1] + " " + f.name).includes(qq)) out.push({ fav: f, i });
      });
    }
    return out;
  }, [query]);
  return (
    <>
      {rows.length ? (
        <>
          <div className="label">
            <span>In the favorites</span>
            <span>{rows.length}</span>
          </div>
          <div className="results">
            {rows.map((r) => (
              <button
                key={r.fav.id + r.i}
                className="res"
                onClick={() => play({ type: "demo", favId: r.fav.id, start: r.i, title: r.fav.tracks[r.i][0], subtitle: r.fav.tracks[r.i][1] + " · from " + r.fav.name })}
              >
                <span className="cover">
                  <Art artKey={r.fav.art} />
                </span>
                <span>
                  <b>{r.fav.tracks[r.i][0]}</b>
                  <small>{r.fav.live ? "Sonos Radio" : r.fav.tracks[r.i][1] + " · " + r.fav.name}</small>
                </span>
                <span className="go-play">Play</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="empty">Nothing in the example favorites matches “{query}”.</p>
      )}
      <div className="banner" style={{ marginTop: 18 }}>
        <div>
          <b>Every song on Spotify</b>
          Connect Spotify in Settings and this box searches all of it: any song, artist or album.
        </div>
        <button className="btn sm gold go" onClick={() => ui.go("settings")}>
          Connect
        </button>
      </div>
    </>
  );
}

/* ---------- browsing ---------- */

function Browse({ play, open }: { play: (i: PlayItem) => void; open: (d: Drill) => void }) {
  const h = useHouse();
  const ui = useUI();
  const [mine, setMine] = useState<sp.SpPlaylist[] | null>(null);
  const [recent, setRecent] = useState<sp.SpTrack[] | null>(null);
  const acct = h.primary;

  useEffect(() => {
    if (h.live) void h.a.loadFavorites().catch((e) => h.a.notify(errorText(e), "err"));
  }, [h.live, h.a]);

  useEffect(() => {
    if (!acct) return;
    let dead = false;
    sp.myPlaylists(acct)
      .then((l) => !dead && setMine(l.filter((p) => !p.name.startsWith(sp.ROOM_PLAYLIST_PREFIX))))
      .catch(() => !dead && setMine([]));
    sp.recentlyPlayed(acct)
      .then((l) => !dead && setRecent(l))
      .catch(() => !dead && setRecent([]));
    return () => {
      dead = true;
    };
  }, [acct]);

  const playingWhere = (name: string) => {
    const zs = h.zones.filter((z) => z.playing && z.source && norm(z.source).startsWith(norm(name)));
    if (!zs.length) return null;
    const names = zs.flatMap((z) => z.roomIds.map(h.a.roomName));
    return <small className="where">Playing {names.length === h.rooms.length && names.length > 1 ? "everywhere" : names.join(" + ")}</small>;
  };

  return (
    <>
      {h.live ? (
        <>
          <div className="label">
            <span>Dad&apos;s Sonos favorites</span>
            <span>{h.favorites?.length ?? ""}</span>
          </div>
          {!h.favorites ? (
            <div className="loading">
              <span className="spin" /> Loading favorites…
            </div>
          ) : h.favorites.length ? (
            <div className="grid">
              {h.favorites
                .filter((f) => !f.name.startsWith(sp.ROOM_PLAYLIST_PREFIX))
                .map((f) => (
                  <button
                    key={f.id}
                    className="fav"
                    onClick={() => play({ type: "sonos-favorite", id: f.id, title: f.name, subtitle: f.description || f.service?.name || "Sonos favorite", art: f.imageUrl })}
                  >
                    <span className="cover">
                      <Art src={f.imageUrl} label={f.name} words />
                    </span>
                    <b>{f.name}</b>
                    <small>{f.description || f.service?.name || "Sonos favorite"}</small>
                    {playingWhere(f.name)}
                  </button>
                ))}
            </div>
          ) : (
            <p className="empty">No Sonos favorites yet. In the Sonos app, tap the heart on anything and it shows up here.</p>
          )}
          {h.sonosPlaylists?.length ? (
            <>
              <div className="label">
                <span>Sonos playlists</span>
              </div>
              <div className="results">
                {h.sonosPlaylists.map((p) => (
                  <button key={p.id} className="res" onClick={() => play({ type: "sonos-playlist", id: p.id, title: p.name, subtitle: (p.trackCount ?? 0) + " songs · Sonos playlist" })}>
                    <span className="cover">
                      <Art label={p.name} />
                    </span>
                    <span>
                      <b>{p.name}</b>
                      <small>{p.trackCount ?? 0} songs</small>
                    </span>
                    <span className="go-play">Play</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : (
        <>
          <div className="label">
            <span>Sonos favorites (examples)</span>
            <span>{DEMO_FAVS.filter((f) => !f.live).length}</span>
          </div>
          <div className="grid">
            {DEMO_FAVS.filter((f) => !f.live).map((f) => (
              <button key={f.id} className="fav" onClick={() => play({ type: "demo", favId: f.id, title: f.name, subtitle: f.kind + " · " + f.tracks.length + " songs" })}>
                <span className="cover">
                  <Art artKey={f.art} words />
                </span>
                <b>{f.name}</b>
                <small>
                  {f.kind} · {f.tracks.length} songs
                </small>
                {playingWhere(f.name)}
              </button>
            ))}
          </div>
          <div className="label">
            <span>Sonos Radio</span>
          </div>
          {DEMO_FAVS.filter((f) => f.live).map((f) => (
            <button key={f.id} className="wide" onClick={() => play({ type: "demo", favId: f.id, title: f.name, subtitle: "Sonos Radio · live" })}>
              <span className="cover">
                <Art artKey={f.art} />
              </span>
              <span>
                <b>{f.name}</b>
                <small>Live station, free with Sonos</small>
                {playingWhere(f.name)}
              </span>
              <span className="go">
                <Icon name="chevR" />
              </span>
            </button>
          ))}
        </>
      )}

      {acct ? (
        <>
          {recent && recent.length ? (
            <>
              <div className="label">
                <span>Played lately on Spotify</span>
              </div>
              <div className="results two">
                {recent.slice(0, 8).map((t) => (
                  <SongRow key={t.id} t={t} play={play} />
                ))}
              </div>
            </>
          ) : null}
          <div className="label">
            <span>{acct.name}&apos;s playlists</span>
            <span>{mine?.length ?? ""}</span>
          </div>
          {!mine ? (
            <div className="loading">
              <span className="spin" /> Loading playlists…
            </div>
          ) : mine.length ? (
            <div className="grid">
              {mine.map((p) => (
                <button
                  key={p.id}
                  className="fav"
                  onClick={() => open({ kind: "playlist", id: p.id, name: p.name, art: sp.img(p.images, true), sub: p.owner?.display_name, mine: p.owner?.id === acct.id })}
                >
                  <span className="cover">
                    <Art src={sp.img(p.images, true)} label={p.name} />
                  </span>
                  <b>{p.name}</b>
                  <small>{(p.items?.total ?? p.tracks?.total ?? 0) + " songs"}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty">No playlists on this Spotify account yet.</p>
          )}
        </>
      ) : (
        <div className="banner" style={{ marginTop: 22 }}>
          <div>
            <b>Search every song</b>
            Connect Spotify in Settings to search any song, artist or album and send it to any room.
          </div>
          <button className="btn sm gold go" onClick={() => ui.go("settings")}>
            Connect
          </button>
        </div>
      )}
    </>
  );
}

/* ---------- drill-in pages ---------- */

function ArtistPage({ d, play, open }: { d: Extract<Drill, { kind: "artist" }>; play: (i: PlayItem) => void; open: (d: Drill) => void }) {
  const h = useHouse();
  const acct = h.primary!;
  const [songs, setSongs] = useState<sp.SpTrack[] | null>(null);
  const [albums, setAlbums] = useState<sp.SpAlbum[] | null>(null);
  useEffect(() => {
    let dead = false;
    sp.artistTracks(acct, d.name, 2)
      .then((t) => !dead && setSongs(t))
      .catch(() => !dead && setSongs([]));
    sp.getArtistAlbums(acct, d.id)
      .then((a) => !dead && setAlbums(a))
      .catch(() => !dead && setAlbums([]));
    return () => {
      dead = true;
    };
  }, [acct, d.id, d.name]);
  const item: PlayItem = { type: "spotify", kind: "artist", uri: "spotify:artist:" + d.id, id: d.id, title: d.name, subtitle: "Artist", art: d.art, artistName: d.name, artistId: d.id };
  return (
    <>
      <div className="hero-row round">
        <span className="cover">
          <Art src={d.art} label={d.name} />
        </span>
        <div>
          <h2>{d.name}</h2>
          <p>Artist</p>
          <div className="hero-actions">
            <button className="btn gold" onClick={() => play(item)}>
              <Icon name="play" />
              Play {d.name}
            </button>
          </div>
        </div>
      </div>
      <div className="label">
        <span>Popular songs</span>
      </div>
      {!songs ? (
        <div className="loading">
          <span className="spin" />
        </div>
      ) : songs.length ? (
        <div className="results two">
          {songs.slice(0, 12).map((t) => (
            <SongRow key={t.id} t={t} play={play} />
          ))}
        </div>
      ) : (
        <p className="empty">No songs found.</p>
      )}
      <div className="label">
        <span>Albums and singles</span>
      </div>
      {!albums ? (
        <div className="loading">
          <span className="spin" />
        </div>
      ) : (
        <div className="grid">
          {albums.map((a) => (
            <button key={a.id} className="fav" onClick={() => open({ kind: "album", id: a.id, name: a.name, art: sp.img(a.images, true), sub: d.name })}>
              <span className="cover">
                <Art src={sp.img(a.images, true)} label={a.name} />
              </span>
              <b>{a.name}</b>
              <small>
                {a.release_date?.slice(0, 4)} · {a.album_type === "single" ? "Single" : "Album"}
              </small>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function AlbumPage({ d, play }: { d: Extract<Drill, { kind: "album" }>; play: (i: PlayItem) => void }) {
  const h = useHouse();
  const acct = h.primary!;
  const [album, setAlbum] = useState<sp.SpAlbum | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    sp.getAlbum(acct, d.id)
      .then((a) => !dead && setAlbum(a))
      .catch((e) => !dead && setErr(errorText(e)));
    return () => {
      dead = true;
    };
  }, [acct, d.id]);
  const item: PlayItem = album
    ? sp.albumToItem(album)
    : { type: "spotify", kind: "album", uri: "spotify:album:" + d.id, id: d.id, title: d.name, subtitle: "Album · " + (d.sub ?? ""), art: d.art };
  return (
    <>
      <div className="hero-row">
        <span className="cover">
          <Art src={d.art} label={d.name} />
        </span>
        <div>
          <h2>{d.name}</h2>
          <p>
            {d.sub}
            {album?.release_date ? " · " + album.release_date.slice(0, 4) : ""}
            {album?.total_tracks ? " · " + album.total_tracks + " songs" : ""}
          </p>
          <div className="hero-actions">
            <button className="btn gold" onClick={() => play(item)}>
              <Icon name="play" />
              Play album
            </button>
          </div>
        </div>
      </div>
      {err ? <p className="empty">{err}</p> : null}
      {!album && !err ? (
        <div className="loading">
          <span className="spin" />
        </div>
      ) : null}
      {album?.tracks?.items?.length ? (
        <>
          <div className="label">
            <span>Songs</span>
          </div>
          <div className="results">
            {album.tracks.items.map((t, i) => (
              <SongRow key={t.id} t={{ ...t, album: { ...album, tracks: undefined } }} play={play} num={t.track_number ?? i + 1} />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

function PlaylistPage({ d, play }: { d: Extract<Drill, { kind: "playlist" }>; play: (i: PlayItem) => void }) {
  const h = useHouse();
  const acct = h.primary!;
  const [songs, setSongs] = useState<sp.SpTrack[] | null>(null);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    let dead = false;
    sp.playlistTracks(acct, d.id, 50)
      .then((t) => !dead && setSongs(t))
      .catch((e) => {
        if (dead) return;
        if (e instanceof sp.SpotifyError && e.status === 403) setLocked(true);
        setSongs([]);
      });
    return () => {
      dead = true;
    };
  }, [acct, d.id]);
  const item: PlayItem = { type: "spotify", kind: "playlist", uri: "spotify:playlist:" + d.id, id: d.id, title: d.name, subtitle: "Playlist" + (d.sub ? " · " + d.sub : ""), art: d.art };
  return (
    <>
      <div className="hero-row">
        <span className="cover">
          <Art src={d.art} label={d.name} />
        </span>
        <div>
          <h2>{d.name}</h2>
          <p>Playlist{d.sub ? " · " + d.sub : ""}</p>
          <div className="hero-actions">
            <button className="btn gold" onClick={() => play(item)}>
              <Icon name="play" />
              Play playlist
            </button>
          </div>
        </div>
      </div>
      {!songs ? (
        <div className="loading">
          <span className="spin" />
        </div>
      ) : locked ? (
        <p className="empty">
          Spotify only shows the songs in your own playlists to apps like this one. It can still play on Spotify speakers, and on Sonos
          through the home hub.
        </p>
      ) : (
        <>
          <div className="label">
            <span>Songs</span>
            <span>{songs.length}</span>
          </div>
          <div className="results two">
            {songs.map((t) => (
              <SongRow key={t.id + t.uri} t={t} play={play} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
