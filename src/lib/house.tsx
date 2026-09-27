"use client";

/*
 * The house: one place that knows every room and speaker, what is playing,
 * and how to change it. Cards, the music picker, settings and the assistant
 * all go through here, so a tap and a spoken request do exactly the same thing.
 *
 * Three kinds of rooms feed it:
 *   demo    the example house, used until Dad's Sonos is linked
 *   sonos   his real rooms, through the Sonos cloud API
 *   spotify Spotify speakers (this browser, phones, receivers), per account
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { AppConfig, EqState, PlayItem, RoomRef, SonosFavorite, SonosPlaylist, SonosSnapshot, Zone } from "./types";
import * as D from "./demo";
import * as sonos from "./sonos";
import * as sp from "./spotify";
import type { SpDevice, SpPlayerState, SpotifyAccount } from "./spotify";
import { browserPlayerStatus, browserSetVolume, startBrowserPlayer, stopBrowserPlayer, subscribeBrowserPlayer } from "./spotifyPlayer";
import * as hubApi from "./hub";
import type { HubConfig, HubRoom } from "./hub";
import { parseSpRoom, sonosRooms, sonosZones, spotifyRooms, spotifyZones } from "./zones";
import { saveScenes, defaultScenes, type Scene } from "./scenes";
import { errorText, listWords, norm, sleep, store } from "./util";
import { useVisible } from "./hooks";

export type Tone = "ok" | "err" | "info";
export interface ToastMsg {
  id: number;
  msg: string;
  tone: Tone;
}

export interface HubState {
  status: "off" | "checking" | "ok" | "error";
  error?: string;
  rooms: HubRoom[];
  mock?: boolean;
}

export interface House {
  config: AppConfig | null;
  live: boolean;
  zones: Zone[];
  spotifyZones: Zone[];
  rooms: RoomRef[];
  spotifyRooms: RoomRef[];
  demo: D.DemoState;
  snap: SonosSnapshot | null;
  sonosError: string | null;
  favorites: SonosFavorite[] | null;
  sonosPlaylists: SonosPlaylist[] | null;
  accounts: SpotifyAccount[];
  primary: SpotifyAccount | null;
  devices: Record<string, SpDevice[]>;
  browser: ReturnType<typeof browserPlayerStatus>;
  hubCfg: HubConfig | null;
  hub: HubState;
  scenes: { id: string; name: string; icon: string; note: string }[];
  liveScenes: Scene[];
  toast: ToastMsg | null;
  focusRoom: string | null;
  a: Actions;
}

export interface Actions {
  notify(msg: string, tone?: Tone): void;
  loadConfig(): Promise<void>;
  setFocus(roomId: string | null): void;
  roomName(id: string): string;
  zoneOfRoom(id: string): Zone | undefined;
  toggle(zoneKey: string): Promise<void>;
  setPlaying(zoneKey: string, on: boolean): Promise<void>;
  step(zoneKey: string, dir: 1 | -1): Promise<void>;
  jump(zoneKey: string, index: number): void;
  setVolume(roomId: string, v: number): void;
  toggleMember(zoneKey: string, roomId: string): Promise<void>;
  leave(roomId: string): Promise<void>;
  split(zoneKey: string): Promise<void>;
  groupRooms(roomIds: string[]): Promise<string>;
  allOff(): Promise<void>;
  play(item: PlayItem, roomIds: string[]): Promise<string>;
  runScene(id: string): Promise<string>;
  saveLiveScenes(list: Scene[] | null): void;
  toggleShuffle(zoneKey: string): void;
  refreshSonos(): Promise<void>;
  loadFavorites(force?: boolean): Promise<SonosFavorite[]>;
  unlinkSonos(): Promise<void>;
  refreshSpotify(withDevices?: boolean): Promise<{ found: SpDevice[]; errors: string[] }>;
  enableBrowserPlayer(): Promise<void>;
  disableBrowserPlayer(): Promise<void>;
  canEq(roomId: string): boolean;
  eqFor(roomId: string): EqState | null;
  loadEq(roomId: string): Promise<void>;
  setEq(roomId: string, patch: Partial<EqState>): void;
  connectHub(cfg: HubConfig): Promise<boolean>;
  disconnectHub(): void;
  checkHub(): Promise<void>;
  setupRoomPlaylists(): Promise<string>;
  roomSetup(): { room: string; favorite: SonosFavorite | null }[];
  submitPin(pin: string): Promise<boolean>;
}

const Ctx = createContext<House | null>(null);

export function useHouse(): House {
  const h = useContext(Ctx);
  if (!h) throw new Error("useHouse must be used inside <HouseProvider>");
  return h;
}

const NO_ACCOUNTS: SpotifyAccount[] = [];
const OFF = { state: "off" } as ReturnType<typeof browserPlayerStatus>;

/** "in the Living Room", "on the Patio", "on this device". */
export function whereOf(name: string): string {
  if (/^this device$/i.test(name)) return "on this device";
  if (/patio|deck|porch|dock|lanai/i.test(name)) return "on the " + name;
  return "in the " + name;
}

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export function HouseProvider({ children }: { children: ReactNode }) {
  const visible = useVisible();
  const accounts = useSyncExternalStore(sp.onAccountsChange, sp.getAccounts, () => NO_ACCOUNTS);
  const browser = useSyncExternalStore(subscribeBrowserPlayer, browserPlayerStatus, () => OFF);

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [demo, setDemo] = useState<D.DemoState>(D.initialDemo);
  // The last snapshot is cached so Dad's rooms appear instantly on open, then refresh.
  const [snap, setSnap] = useState<SonosSnapshot | null>(() => store.get<SonosSnapshot | null>("cc.snap", null));
  const [sonosError, setSonosError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<SonosFavorite[] | null>(null);
  const [sonosPlaylists, setSonosPlaylists] = useState<SonosPlaylist[] | null>(null);
  const [devices, setDevices] = useState<Record<string, SpDevice[]>>({});
  const [spStates, setSpStates] = useState<Record<string, { s: SpPlayerState | null; at: number }>>({});
  const [hubCfg, setHubCfg] = useState<HubConfig | null>(() => hubApi.getHubConfig());
  const [hub, setHub] = useState<HubState>({ status: "off", rooms: [] });
  const [eqCache, setEqCache] = useState<Record<string, EqState>>({});
  const [playOv, setPlayOv] = useState<Record<string, boolean>>({});
  const [volOv, setVolOv] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [focusRoom, setFocusRoom] = useState<string | null>(null);
  const [savedScenes, setSavedScenes] = useState<Scene[] | null>(() => store.get<Scene[] | null>("cc.scenes", null));

  // Before the config arrives, trust the cache: a cached snapshot means Sonos was linked.
  const linked = config ? config.sonosLinked : !!snap;
  const live = linked && !!snap;

  /* ---------- derived views ---------- */

  const zones = useMemo(() => {
    const base = linked ? (snap ? sonosZones(snap, hub.rooms) : []) : D.demoZones(demo, 0);
    return base.map((z) => {
      const p = playOv[z.key];
      const members = z.members.map((m) => (volOv[m.roomId] !== undefined ? { ...m, volume: volOv[m.roomId] } : m));
      return p !== undefined || members.some((m, i) => m !== z.members[i]) ? { ...z, playing: p ?? z.playing, members } : z;
    });
  }, [linked, snap, hub.rooms, demo, playOv, volOv]);

  const spZones = useMemo(() => {
    return spotifyZones(accounts, devices, spStates, browser).map((z) => {
      const p = playOv[z.key];
      const m = z.members[0];
      const v = volOv[m.roomId];
      return p !== undefined || v !== undefined ? { ...z, playing: p ?? z.playing, members: [{ ...m, volume: v ?? m.volume }] } : z;
    });
  }, [accounts, devices, spStates, browser, playOv, volOv]);

  const rooms = useMemo(() => (linked ? (snap ? sonosRooms(snap, zones) : []) : D.demoRooms(demo)), [linked, snap, zones, demo]);
  const spRooms = useMemo(() => spotifyRooms(spZones), [spZones]);

  const liveScenes = useMemo(() => savedScenes ?? defaultScenes(rooms.map((r) => r.name)), [savedScenes, rooms]);
  const scenes = useMemo(
    () => (live ? liveScenes : D.DEMO_SCENES).map((s) => ({ id: s.id, name: s.name, icon: s.icon, note: s.note })),
    [live, liveScenes],
  );

  /* ---------- latest state for async actions ---------- */

  const R = useRef({
    config,
    demo,
    snap,
    live,
    zones,
    spZones,
    rooms,
    spRooms,
    favorites,
    accounts,
    hubCfg,
    hub,
    eqCache,
    liveScenes,
    focusRoom,
  });
  useEffect(() => {
    R.current = { config, demo, snap, live, zones, spZones, rooms, spRooms, favorites, accounts, hubCfg, hub, eqCache, liveScenes, focusRoom };
  });

  /* ---------- polling ---------- */

  const sonosBusy = useRef(false);
  const lastSaved = useRef(0);
  const pollSonos = useCallback(async () => {
    if (sonosBusy.current) return;
    sonosBusy.current = true;
    try {
      const s = await sonos.snapshot(store.get<string | null>("cc.household", null) ?? undefined);
      if (!s) {
        setSnap(null);
        store.del("cc.snap");
        setConfig((c) => (c ? { ...c, sonosLinked: false } : c));
      } else {
        setSnap(s);
        setSonosError(null);
        if (Date.now() - lastSaved.current > 20000) {
          lastSaved.current = Date.now();
          store.set("cc.snap", s);
        }
      }
    } catch (e) {
      setSonosError(errorText(e));
    } finally {
      sonosBusy.current = false;
    }
  }, []);

  const kickTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const kickSonos = useCallback(() => {
    kickTimers.current.forEach(clearTimeout);
    kickTimers.current = [600, 2200].map((ms) => setTimeout(pollSonos, ms));
  }, [pollSonos]);

  useEffect(() => {
    if (!linked || !visible) return;
    const t0 = setTimeout(pollSonos, 0);
    const t = setInterval(pollSonos, 5000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [linked, visible, pollSonos]);

  const pollSpotify = useCallback(async (withDevices = false) => {
    const list = sp.getAccounts();
    const found: SpDevice[] = [];
    const errors: string[] = [];
    await Promise.all(
      list.map(async (a) => {
        try {
          const s = await sp.playerState(a);
          setSpStates((m) => ({ ...m, [a.id]: { s, at: Date.now() } }));
        } catch {
          /* keep the last known state */
        }
        if (withDevices) {
          try {
            const d = await sp.devices(a);
            found.push(...d);
            setDevices((m) => ({ ...m, [a.id]: d }));
          } catch (e) {
            errors.push(errorText(e));
          }
        }
      }),
    );
    return { found, errors };
  }, []);

  const spTick = useRef(0);
  useEffect(() => {
    if (!accounts.length || !visible) return;
    const t0 = setTimeout(() => pollSpotify(true), 0);
    const t = setInterval(() => {
      spTick.current += 1;
      pollSpotify(spTick.current % 4 === 0);
    }, 5000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [accounts.length, visible, pollSpotify]);

  const kickSpotify = useCallback(
    (withDevices = false) => {
      setTimeout(() => pollSpotify(withDevices), 700);
      setTimeout(() => pollSpotify(withDevices), 2500);
    },
    [pollSpotify],
  );

  // When this browser becomes a Spotify speaker, refresh the list so it shows up.
  useEffect(() => {
    if (browser.state !== "ready") return;
    const t = setTimeout(() => pollSpotify(true), 1200);
    return () => clearTimeout(t);
  }, [browser.state, browser.deviceId, pollSpotify]);

  const checkHubWith = useCallback(async (cfg: HubConfig | null) => {
    if (!cfg) {
      setHub({ status: "off", rooms: [] });
      return;
    }
    setHub((h) => ({ ...h, status: "checking" }));
    try {
      const st = await hubApi.hubStatus(cfg);
      const rooms = await hubApi.hubRooms(cfg);
      setHub({ status: "ok", rooms, mock: st.mock });
    } catch (e) {
      setHub({ status: "error", error: errorText(e), rooms: [] });
    }
  }, []);

  useEffect(() => {
    if (!hubCfg || !visible) return;
    const t0 = setTimeout(() => checkHubWith(hubCfg), 0);
    const t = setInterval(() => checkHubWith(hubCfg), 60000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [hubCfg, visible, checkHubWith]);

  // The example house keeps playing: advance the clocks once a second.
  useEffect(() => {
    if (live || !visible) return;
    const t = setInterval(() => setDemo((d) => D.demoTick(d) ?? d), 1000);
    return () => clearInterval(t);
  }, [live, visible]);

  /* ---------- actions ---------- */

  const a = useMemo<Actions>(() => {
    const notify = (msg: string, tone: Tone = "ok") => setToast({ id: Date.now() + Math.random(), msg, tone });

    const overridePlay = (key: string, v: boolean) => {
      setPlayOv((m) => ({ ...m, [key]: v }));
      setTimeout(
        () =>
          setPlayOv((m) => {
            const n = { ...m };
            delete n[key];
            return n;
          }),
        3500,
      );
    };
    const overrideVol = (roomId: string, v: number) => {
      setVolOv((m) => ({ ...m, [roomId]: v }));
      clearTimeout(volClear.get(roomId));
      volClear.set(
        roomId,
        setTimeout(
          () =>
            setVolOv((m) => {
              const n = { ...m };
              delete n[roomId];
              return n;
            }),
          4000,
        ),
      );
    };
    const volClear = new Map<string, ReturnType<typeof setTimeout>>();
    const volSend = new Map<string, { t: ReturnType<typeof setTimeout> | null; v: number }>();

    const allZones = () => [...R.current.zones, ...R.current.spZones];
    const zone = (key: string) => allZones().find((z) => z.key === key);
    const zoneOfRoom = (id: string) => allZones().find((z) => z.roomIds.includes(id));
    const roomName = (id: string) =>
      R.current.rooms.find((r) => r.id === id)?.name ?? R.current.spRooms.find((r) => r.id === id)?.name ?? D.DEMO_ROOM[id]?.name ?? id;

    const spFor = (roomId: string) => {
      const p = parseSpRoom(roomId);
      const acct = p && R.current.accounts.find((x) => x.id === p.acctId);
      if (!p || !acct) throw new Error("That Spotify speaker's account isn't signed in anymore.");
      return { acct, deviceId: p.deviceId };
    };

    const primary = () => R.current.accounts[0] ?? null;

    const ensureGroup = async (ids: string[]) => {
      const s = R.current.snap;
      if (!s) throw new Error("Sonos isn't linked.");
      const g = s.groups.find((x) => sameSet(x.playerIds, ids));
      if (g) return { id: g.id, coordinatorId: g.coordinatorId };
      const ng = await sonos.createGroup(s.householdId, ids);
      return { id: ng.id, coordinatorId: ng.coordinatorId ?? ids[0] };
    };

    const loadFavorites = async (force = false): Promise<SonosFavorite[]> => {
      const s = R.current.snap;
      if (!s) return [];
      if (R.current.favorites && !force) return R.current.favorites;
      const [f, p] = await Promise.all([sonos.favorites(s.householdId), sonos.playlists(s.householdId).catch(() => [])]);
      setFavorites(f);
      setSonosPlaylists(p);
      R.current.favorites = f;
      return f;
    };

    const roomFavorite = (favs: SonosFavorite[], room: string) =>
      favs.find((f) => norm(f.name) === norm(sp.roomPlaylistName(room))) ?? null;
    const anyCompassFavorite = (favs: SonosFavorite[]) => favs.find((f) => norm(f.name).startsWith(norm(sp.ROOM_PLAYLIST_PREFIX))) ?? null;

    const playlistIds = new Map<string, string>();
    const roomPlaylistId = async (acct: SpotifyAccount, name: string) => {
      const k = acct.id + "|" + name;
      if (playlistIds.has(k)) return playlistIds.get(k)!;
      const p = await sp.findPlaylistByName(acct, name);
      if (p) playlistIds.set(k, p.id);
      return p?.id ?? null;
    };

    /** Check the room really switched; Spotify sometimes serves the old playlist for a moment. */
    const verifyLoaded = async (roomId: string, expectTitle: string | undefined, groupId: string, favId: string) => {
      if (!expectTitle) return;
      await sleep(3500);
      const s = await sonos.snapshot().catch(() => null);
      if (!s) return;
      const g = s.groups.find((x) => x.playerIds.includes(roomId));
      const now = g && s.metadata[g.id]?.currentItem?.track?.name;
      if (now && norm(now) !== norm(expectTitle) && g) {
        await sonos.loadFavorite(g.id ?? groupId, favId).catch(() => {});
      }
      setSnap(s);
    };

    const spotifyOnSonos = async (item: Extract<PlayItem, { type: "spotify" }>, ids: string[]) => {
      const acct = primary();
      if (!acct) throw new Error("Connect Spotify in Settings first. That's what lets you search every song.");
      const g = await ensureGroup(ids);
      const { hubCfg: cfg, hub: h } = R.current;
      const hubKnows = cfg && h.status === "ok" && h.rooms.some((r) => r.id === g.coordinatorId || ids.includes(r.id));
      if (cfg && hubKnows) {
        const coord = h.rooms.some((r) => r.id === g.coordinatorId) ? g.coordinatorId : ids[0];
        if (item.kind === "album" || item.kind === "playlist") {
          await hubApi.hubPlay(cfg, coord, item.uri, "replace");
        } else {
          const { uris } = await sp.resolveUris(acct, item, 16);
          if (!uris.length) throw new Error("Spotify didn't find songs for that.");
          await hubApi.hubPlay(cfg, coord, uris[0], "replace");
          void (async () => {
            for (const u of uris.slice(1)) {
              try {
                await hubApi.hubPlay(cfg, coord, u, "append");
              } catch {
                break;
              }
            }
          })();
        }
        return;
      }
      const favs = await loadFavorites();
      const room = roomName(ids[0]);
      const fav = roomFavorite(favs, room) ?? anyCompassFavorite(favs);
      if (!fav) {
        throw new Error("One quick setup step first: open Settings, then Play any song on Sonos. It takes about two minutes.");
      }
      const plId = await roomPlaylistId(acct, fav.name);
      if (!plId) {
        throw new Error(`Couldn't find the playlist "${fav.name}" in ${acct.name}'s Spotify. Sign in with the Spotify account that Sonos uses.`);
      }
      let resolved: { uris: string[]; first?: string };
      try {
        resolved = await sp.resolveUris(acct, item, 40);
      } catch (e) {
        if (e instanceof sp.SpotifyError && e.status === 403 && item.kind === "playlist") {
          throw new Error("That playlist belongs to someone else, so Spotify won't hand its songs to the app. Try the artist or a song instead.");
        }
        throw e;
      }
      const { uris, first } = resolved;
      if (!uris.length) throw new Error("Spotify didn't find songs for that.");
      await sp.replacePlaylist(acct, plId, uris);
      await sleep(900);
      await sonos.loadFavorite(g.id, fav.id);
      void verifyLoaded(ids[0], item.kind === "track" ? item.title : first, g.id, fav.id);
    };

    const playOnSonos = async (item: PlayItem, ids: string[]) => {
      if (item.type === "demo") throw new Error("That's an example favorite. Pick one of the real ones.");
      if (item.type === "sonos-favorite") {
        const g = await ensureGroup(ids);
        await sonos.loadFavorite(g.id, item.id);
      } else if (item.type === "sonos-playlist") {
        const g = await ensureGroup(ids);
        await sonos.loadPlaylist(g.id, item.id);
      } else {
        await spotifyOnSonos(item, ids);
      }
      kickSonos();
    };

    const playOnSpotifyDevice = async (item: PlayItem, roomId: string) => {
      if (item.type !== "spotify") throw new Error("Sonos favorites only play on Sonos rooms. Search for it instead.");
      const { acct, deviceId } = spFor(roomId);
      if (item.kind === "track") {
        const { uris } = await sp.resolveUris(acct, item, 30);
        await sp.playOnDevice(acct, deviceId, { uris });
      } else {
        await sp.playOnDevice(acct, deviceId, { context_uri: item.uri });
      }
      kickSpotify(true);
    };

    const play = async (item: PlayItem, roomIds: string[]): Promise<string> => {
      const ids = [...new Set(roomIds)];
      if (!ids.length) throw new Error("Pick a room first.");
      const demoIds = ids.filter((id) => D.DEMO_ROOM[id]);
      const spIds = ids.filter((id) => id.startsWith("sp:"));
      const sonosIds = ids.filter((id) => !D.DEMO_ROOM[id] && !id.startsWith("sp:"));
      const done: string[] = [];
      if (demoIds.length) {
        if (item.type !== "demo") {
          throw new Error("The example rooms can't play real music. Link Dad's Sonos in Settings, or pick a Spotify speaker.");
        }
        setDemo((d) => D.demoPlayOn(d, item.favId, demoIds, item.start ?? 0));
        done.push(...demoIds.map(roomName));
      }
      if (sonosIds.length) {
        await playOnSonos(item, sonosIds);
        done.push(...sonosIds.map(roomName));
      }
      const speakers: string[] = [];
      for (const id of spIds) {
        await playOnSpotifyDevice(item, id);
        speakers.push(roomName(id));
      }
      const all = R.current.rooms.length > 1 && R.current.rooms.every((r) => done.includes(r.name));
      const where = [
        ...(all ? ["in every room"] : done.map(whereOf)),
        ...speakers.map((n) => (/^this device$/i.test(n) ? "on this device" : "on " + n)),
      ];
      return item.title + " is playing " + listWords(where) + ".";
    };

    const setPlaying = async (key: string, on: boolean) => {
      const z = zone(key);
      if (!z || z.playing === on) return;
      if (z.kind === "demo") {
        setDemo((d) => D.demoToggle(d, z.id, on));
        return;
      }
      overridePlay(key, on);
      try {
        if (z.kind === "sonos") {
          await (on ? sonos.play(z.id) : sonos.pause(z.id));
          kickSonos();
        } else {
          const { acct, deviceId } = spFor(z.roomIds[0]);
          await (on ? sp.resume(acct, deviceId) : sp.pause(acct, deviceId));
          kickSpotify();
        }
      } catch (e) {
        notify(errorText(e), "err");
      }
    };

    const toggle = async (key: string) => {
      const z = zone(key);
      if (z) await setPlaying(key, !z.playing);
    };

    const step = async (key: string, dir: 1 | -1) => {
      const z = zone(key);
      if (!z) return;
      if (z.kind === "demo") {
        let n: D.DemoState | null = null;
        setDemo((d) => {
          n = D.demoStep(d, z.id, dir);
          return n ?? d;
        });
        if (!z.canSkip) notify("Radio is live, so there is nothing to skip.", "info");
        return;
      }
      if (!z.canSkip) {
        notify("This is live radio, so there is nothing to skip.", "info");
        return;
      }
      try {
        if (z.kind === "sonos") {
          await (dir > 0 ? sonos.skipNext(z.id) : sonos.skipPrev(z.id));
          kickSonos();
        } else {
          const { acct, deviceId } = spFor(z.roomIds[0]);
          await (dir > 0 ? sp.next(acct, deviceId) : sp.previous(acct, deviceId));
          kickSpotify();
        }
      } catch (e) {
        notify(errorText(e), "err");
      }
    };

    const jump = (key: string, index: number) => {
      const z = zone(key);
      if (z?.kind === "demo") setDemo((d) => D.demoJump(d, z.id, index));
    };

    const setVolume = (roomId: string, v: number) => {
      const vol = Math.round(Math.max(0, Math.min(100, v)));
      if (D.DEMO_ROOM[roomId] && !R.current.live) {
        setDemo((d) => D.demoSetVol(d, roomId, vol));
        return;
      }
      overrideVol(roomId, vol);
      const slot = volSend.get(roomId) ?? { t: null, v: vol };
      slot.v = vol;
      volSend.set(roomId, slot);
      if (slot.t) return;
      slot.t = setTimeout(async () => {
        slot.t = null;
        try {
          if (roomId.startsWith("sp:")) {
            const { acct, deviceId } = spFor(roomId);
            if (deviceId === browserPlayerStatus().deviceId) await browserSetVolume(slot.v);
            else await sp.setVolume(acct, deviceId, slot.v);
          } else {
            await sonos.setPlayerVolume(roomId, slot.v);
          }
        } catch (e) {
          notify(errorText(e), "err");
        }
      }, 220);
    };

    const toggleMember = async (key: string, roomId: string) => {
      const z = zone(key);
      if (!z) return;
      if (z.kind === "demo") {
        let joined = false;
        setDemo((d) => {
          const r = D.demoToggleMember(d, z.id, roomId);
          joined = r.joined;
          return r.state;
        });
        setTimeout(() => notify(roomName(roomId) + (joined ? " joined and is playing in sync." : " is back on its own music.")), 0);
        return;
      }
      if (z.kind !== "sonos") return;
      try {
        const inGroup = z.roomIds.includes(roomId);
        await sonos.modifyGroup(z.id, inGroup ? [] : [roomId], inGroup ? [roomId] : []);
        notify(roomName(roomId) + (inGroup ? " is on its own again." : " joined and is playing in sync."));
        kickSonos();
      } catch (e) {
        notify(errorText(e), "err");
      }
    };

    const leave = async (roomId: string) => {
      const z = zoneOfRoom(roomId);
      if (!z || z.roomIds.length < 2) return;
      if (z.kind === "demo") {
        setDemo((d) => D.demoLeave(d, roomId));
        return;
      }
      await sonos.modifyGroup(z.id, [], [roomId]);
      kickSonos();
    };

    const split = async (key: string) => {
      const z = zone(key);
      if (!z) return;
      if (z.kind === "demo") {
        setDemo((d) => D.demoSplit(d, z.id));
        notify("Split. Each room is back on its own music.");
        return;
      }
      try {
        await sonos.modifyGroup(z.id, [], z.roomIds.slice(1));
        notify("Split. Each room can play its own music now.");
        kickSonos();
      } catch (e) {
        notify(errorText(e), "err");
      }
    };

    const groupRooms = async (roomIds: string[]): Promise<string> => {
      const ids = [...new Set(roomIds)];
      if (ids.length < 2) throw new Error("Pick at least two rooms to group.");
      if (!R.current.live) {
        const lead = ids[0];
        setDemo((d) => {
          let s = d;
          for (const id of ids.slice(1)) {
            const zl = D.demoLeaderOf(s, lead);
            if (D.demoLeaderOf(s, id) !== zl) s = D.demoToggleMember(s, zl, id).state;
          }
          return s;
        });
        return listWords(ids.map(roomName)) + " are playing together.";
      }
      const s = R.current.snap!;
      const src = R.current.zones.find((z) => z.roomIds.includes(ids[0]));
      await sonos.createGroup(s.householdId, ids, src?.id);
      kickSonos();
      return listWords(ids.map(roomName)) + " are playing together.";
    };

    const allOff = async () => {
      if (!R.current.live) setDemo((d) => D.demoAllOff(d));
      const jobs: Promise<unknown>[] = [];
      for (const z of R.current.zones) if (z.kind === "sonos" && z.playing) jobs.push(setPlaying(z.key, false));
      for (const z of R.current.spZones) if (z.playing) jobs.push(setPlaying(z.key, false));
      await Promise.all(jobs);
      notify("Every room is paused.");
    };

    const runScene = async (id: string): Promise<string> => {
      if (!R.current.live) {
        const sc = D.DEMO_SCENES.find((s) => s.id === id || norm(s.name) === norm(id));
        if (!sc) throw new Error("There's no scene called " + id + ".");
        let msg = "";
        setDemo((d) => {
          const r = sc.run(d);
          msg = r.msg;
          return r.state;
        });
        await sleep(0);
        return msg || sc.name + " is on.";
      }
      const sc = R.current.liveScenes.find((s) => s.id === id || norm(s.name) === norm(id));
      if (!sc) throw new Error("There's no scene called " + id + ".");
      const rooms = R.current.rooms;
      const names = sc.rooms.includes("*") ? rooms.map((r) => r.name) : sc.rooms;
      const ids = names.map((n) => rooms.find((r) => norm(r.name) === norm(n))?.id).filter((x): x is string => !!x);
      if (!ids.length) throw new Error(sc.name + " doesn't match any rooms here. Edit it in Settings.");
      if (sc.music) {
        await play(sc.music, ids);
      } else {
        const s = R.current.snap!;
        const zs = R.current.zones.filter((z) => z.roomIds.some((r) => ids.includes(r)));
        const src = zs.find((z) => z.playing) ?? zs.find((z) => z.track) ?? null;
        let groupId = s.groups.find((g) => sameSet(g.playerIds, ids))?.id;
        if (!groupId) {
          const g = await sonos.createGroup(s.householdId, ids, src?.id);
          groupId = g.id;
        }
        if (!src?.playing) await sonos.play(groupId).catch(() => {});
      }
      await Promise.all(
        ids.map((rid) => {
          const v = sc.volumes[roomName(rid)] ?? sc.volumes["*"];
          return v == null ? null : sonos.setPlayerVolume(rid, v).catch(() => {});
        }),
      );
      if (sc.pauseOthers) {
        await Promise.all(
          R.current.zones.filter((z) => z.playing && !z.roomIds.some((r) => ids.includes(r))).map((z) => sonos.pause(z.id).catch(() => {})),
        );
      }
      kickSonos();
      return sc.name + " is on.";
    };

    const saveLiveScenes = (list: Scene[] | null) => {
      saveScenes(list);
      setSavedScenes(list);
    };

    const toggleShuffle = (key: string) => {
      const z = zone(key);
      if (z?.kind === "demo") {
        setDemo((d) => ({ ...d, shuffle: !d.shuffle }));
        return;
      }
      if (z?.kind === "sonos") {
        const cur = R.current.snap?.playback[z.id]?.playModes?.shuffle ?? false;
        sonos
          .setPlayModes(z.id, { shuffle: !cur })
          .then(() => {
            notify(cur ? "Shuffle is off." : "Shuffle is on.");
            kickSonos();
          })
          .catch((e) => notify(errorText(e), "err"));
      }
    };

    const refreshSonos = async () => {
      await pollSonos();
    };

    const unlinkSonos = async () => {
      await sonos.unlink();
      store.del("cc.snap");
      setSnap(null);
      setFavorites(null);
      setConfig((c) => (c ? { ...c, sonosLinked: false } : c));
      notify("Sonos is unlinked on this device.");
    };

    const refreshSpotify = (withDevices = true) => pollSpotify(withDevices);

    const enableBrowserPlayer = async () => {
      const acct = primary();
      if (!acct) {
        notify("Connect Spotify first.", "err");
        return;
      }
      const ua = navigator.userAgent;
      const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      const kind = iPad ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Phone" : /Macintosh/.test(ua) ? "Mac" : "PC";
      await startBrowserPlayer(() => sp.accessToken(acct), "Compass Classics (" + kind + ")");
    };

    const disableBrowserPlayer = async () => {
      await stopBrowserPlayer();
      kickSpotify(true);
    };

    const canEq = (roomId: string) => {
      if (!R.current.live) return !!D.DEMO_ROOM[roomId];
      return R.current.hub.status === "ok" && R.current.hub.rooms.some((r) => r.id === roomId);
    };

    const eqFor = (roomId: string): EqState | null => {
      if (!R.current.live) return R.current.demo.eq[roomId] ?? null;
      return R.current.eqCache[roomId] ?? null;
    };

    const loadEq = async (roomId: string) => {
      const cfg = R.current.hubCfg;
      if (!R.current.live || !cfg || !canEq(roomId)) return;
      try {
        const e = await hubApi.hubGetEq(cfg, roomId);
        setEqCache((m) => ({ ...m, [roomId]: e }));
      } catch (e) {
        notify(errorText(e), "err");
      }
    };

    const eqSend = new Map<string, { t: ReturnType<typeof setTimeout> | null; patch: Partial<EqState> }>();
    const setEq = (roomId: string, patch: Partial<EqState>) => {
      if (!R.current.live) {
        setDemo((d) => D.demoSetEq(d, roomId, patch));
        return;
      }
      const cfg = R.current.hubCfg;
      if (!cfg || !canEq(roomId)) {
        notify("Sound settings need the home hub. See Settings, Home hub.", "err");
        return;
      }
      setEqCache((m) => ({ ...m, [roomId]: { ...(m[roomId] ?? ({} as EqState)), ...patch } }));
      const slot = eqSend.get(roomId) ?? { t: null, patch: {} };
      slot.patch = { ...slot.patch, ...patch };
      eqSend.set(roomId, slot);
      if (slot.t) return;
      slot.t = setTimeout(async () => {
        const body = slot.patch;
        slot.patch = {};
        slot.t = null;
        try {
          const e = await hubApi.hubSetEq(cfg, roomId, body);
          setEqCache((m) => ({ ...m, [roomId]: e }));
        } catch (err) {
          notify(errorText(err), "err");
        }
      }, 250);
    };

    const connectHub = async (cfg: HubConfig) => {
      const clean = { url: cfg.url.trim().replace(/\/+$/, ""), key: cfg.key.trim() };
      try {
        await hubApi.hubStatus(clean);
      } catch (e) {
        notify(errorText(e), "err");
        return false;
      }
      hubApi.setHubConfig(clean);
      setHubCfg(clean);
      await checkHubWith(clean);
      notify("Home hub connected.");
      return true;
    };

    const disconnectHub = () => {
      hubApi.setHubConfig(null);
      setHubCfg(null);
      setHub({ status: "off", rooms: [] });
    };

    const checkHub = () => checkHubWith(R.current.hubCfg);

    const roomSetup = () => {
      const favs = R.current.favorites ?? [];
      return R.current.rooms.map((r) => ({ room: r.name, favorite: roomFavorite(favs, r.name) }));
    };

    const setupRoomPlaylists = async (): Promise<string> => {
      const acct = primary();
      if (!acct) throw new Error("Connect Spotify first, with the same account Sonos uses.");
      const names = R.current.rooms.map((r) => r.name);
      if (!names.length) throw new Error("No rooms yet. Link Sonos first.");
      // Seed each playlist with one song so Sonos can open it.
      let seed: string | null = null;
      try {
        const r = await sp.search(acct, "Hotel California Eagles", ["track"]);
        seed = r.tracks[0]?.uri ?? null;
      } catch {
        seed = null;
      }
      const made: string[] = [];
      for (const n of names) {
        const name = sp.roomPlaylistName(n);
        let id = await roomPlaylistId(acct, name);
        if (!id) {
          const p = await sp.createPlaylist(acct, name, "Used by Compass Classics to send music to the " + n + ". Leave it in your library.");
          id = p.id;
          playlistIds.set(acct.id + "|" + name, id);
          if (seed) await sp.replacePlaylist(acct, id, [seed]).catch(() => {});
          made.push(n);
        }
      }
      return made.length
        ? "Made " + made.length + " room playlist" + (made.length > 1 ? "s" : "") + " in " + acct.name + "'s Spotify."
        : "The room playlists are already there.";
    };

    const submitPin = async (pin: string) => {
      const res = await fetch("/api/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      if (!res.ok) return false;
      setConfig((c) => (c ? { ...c, member: true } : c));
      return true;
    };

    const loadConfig = async () => {
      try {
        const res = await fetch("/api/config", { cache: "no-store" });
        const j = (await res.json()) as AppConfig;
        const override = sp.clientIdOverride();
        setConfig({ ...j, spotifyClientId: override || j.spotifyClientId });
      } catch {
        setConfig({ sonosReady: false, sonosLinked: false, assistantReady: false, spotifyClientId: sp.clientIdOverride(), member: false, pinSet: false });
      }
    };

    return {
      notify,
      loadConfig,
      setFocus: (id) => setFocusRoom(id),
      roomName,
      zoneOfRoom,
      toggle,
      setPlaying,
      step,
      jump,
      setVolume,
      toggleMember,
      leave,
      split,
      groupRooms,
      allOff,
      play,
      runScene,
      saveLiveScenes,
      toggleShuffle,
      refreshSonos,
      loadFavorites,
      unlinkSonos,
      refreshSpotify,
      enableBrowserPlayer,
      disableBrowserPlayer,
      canEq,
      eqFor,
      loadEq,
      setEq,
      connectHub,
      disconnectHub,
      checkHub,
      setupRoomPlaylists,
      roomSetup,
      submitPin,
    };
  }, [pollSonos, kickSonos, pollSpotify, kickSpotify, checkHubWith]);

  useEffect(() => {
    const t = setTimeout(() => a.loadConfig(), 0);
    return () => clearTimeout(t);
  }, [a]);

  const value: House = {
    config,
    live,
    zones,
    spotifyZones: spZones,
    rooms,
    spotifyRooms: spRooms,
    demo,
    snap,
    sonosError,
    favorites,
    sonosPlaylists,
    accounts,
    primary: accounts[0] ?? null,
    devices,
    browser,
    hubCfg,
    hub,
    scenes,
    liveScenes,
    toast,
    focusRoom,
    a,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
