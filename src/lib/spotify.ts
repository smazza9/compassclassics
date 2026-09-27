/*
 * Spotify, straight from the browser. Sign-in is PKCE (no secret anywhere),
 * tokens live in this browser's storage, and every call goes directly to
 * api.spotify.com. Several accounts can be signed in at once, so two Spotify
 * speakers can play different music at the same time.
 */

import type { PlayItem, SpotifyKind } from "./types";
import { store, sleep } from "./util";

const API = "https://api.spotify.com/v1";
const AUTHORIZE = "https://accounts.spotify.com/authorize";
const TOKEN = "https://accounts.spotify.com/api/token";

const ACCOUNTS_KEY = "cc.sp.accounts";
const CLIENT_KEY = "cc.sp.clientId";
const PKCE_KEY = "cc.sp.pkce";

export const SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-read-recently-played",
  "streaming",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-library-read",
];

export interface SpotifyAccount {
  id: string;
  name: string;
  image?: string | null;
  product?: string;
  email?: string;
  clientId: string;
  token: { access: string; refresh: string; exp: number; scope?: string };
}

export class SpotifyError extends Error {
  status: number;
  reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

/* ---------- accounts ---------- */

let accountsCache: SpotifyAccount[] | null = null;
const listeners = new Set<() => void>();

export function getAccounts(): SpotifyAccount[] {
  if (!accountsCache) accountsCache = store.get<SpotifyAccount[]>(ACCOUNTS_KEY, []);
  return accountsCache;
}

function saveAccounts(list: SpotifyAccount[]) {
  accountsCache = list;
  store.set(ACCOUNTS_KEY, list);
  listeners.forEach((f) => f());
}

export function onAccountsChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function removeAccount(id: string) {
  saveAccounts(getAccounts().filter((a) => a.id !== id));
}

/** Make an account the one used for search (the first in the list). */
export function makePrimary(id: string) {
  const list = getAccounts();
  const a = list.find((x) => x.id === id);
  if (a) saveAccounts([a, ...list.filter((x) => x.id !== id)]);
}

function updateToken(id: string, token: SpotifyAccount["token"]) {
  saveAccounts(getAccounts().map((a) => (a.id === id ? { ...a, token } : a)));
}

/* ---------- client id ---------- */

/** A Client ID typed into Settings wins over the one set on the server. */
export function clientIdOverride(): string | null {
  return store.get<string | null>(CLIENT_KEY, null);
}
export function setClientIdOverride(id: string | null) {
  if (id && id.trim()) store.set(CLIENT_KEY, id.trim());
  else store.del(CLIENT_KEY);
}

export const redirectUri = () => location.origin + "/spotify/callback";

/* ---------- PKCE sign in ---------- */

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  b.forEach((c) => (s += String.fromCharCode(c)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(n: number) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a).slice(0, n);
}

export async function beginLogin(clientId: string, opts: { chooseAccount?: boolean; returnTo?: string } = {}) {
  const verifier = randomString(64);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = randomString(16);
  store.set(PKCE_KEY, { verifier, state, clientId, returnTo: opts.returnTo ?? "/", at: Date.now() });
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES.join(" "),
    state,
  });
  if (opts.chooseAccount) p.set("show_dialog", "true");
  location.assign(AUTHORIZE + "?" + p.toString());
}

export async function finishLogin(params: URLSearchParams): Promise<{ account: SpotifyAccount; returnTo: string }> {
  const err = params.get("error");
  if (err) throw new Error(err === "access_denied" ? "Spotify sign in was cancelled." : "Spotify said: " + err);
  const saved = store.get<{ verifier: string; state: string; clientId: string; returnTo: string } | null>(PKCE_KEY, null);
  const code = params.get("code");
  if (!saved || !code || saved.state !== params.get("state")) {
    throw new Error("That sign in link expired. Start it again from Settings.");
  }
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: saved.clientId,
      code_verifier: saved.verifier,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error_description || j.error || "Spotify sign in failed.");
  const token = {
    access: j.access_token as string,
    refresh: j.refresh_token as string,
    exp: Date.now() + (j.expires_in ?? 3600) * 1000,
    scope: j.scope as string | undefined,
  };
  const meRes = await fetch(API + "/me", { headers: { Authorization: "Bearer " + token.access } });
  if (!meRes.ok) {
    const t = await meRes.text();
    if (meRes.status === 403) {
      throw new Error(
        "Spotify blocked this account. In the Spotify developer dashboard, open the app, then User Management, and add this account's email. Development apps only allow accounts on that list.",
      );
    }
    throw new Error("Could not read the Spotify profile (" + meRes.status + "): " + t.slice(0, 160));
  }
  const me = await meRes.json();
  const account: SpotifyAccount = {
    id: me.id,
    name: me.display_name || me.id,
    image: me.images?.[0]?.url ?? null,
    product: me.product,
    email: me.email,
    clientId: saved.clientId,
    token,
  };
  const list = getAccounts().filter((a) => a.id !== account.id);
  saveAccounts([...list, account]);
  store.del(PKCE_KEY);
  return { account, returnTo: saved.returnTo || "/" };
}

/* ---------- tokens and calls ---------- */

const refreshing = new Map<string, Promise<string>>();

async function refresh(acct: SpotifyAccount): Promise<string> {
  let p = refreshing.get(acct.id);
  if (!p) {
    p = (async () => {
      const current = getAccounts().find((a) => a.id === acct.id) ?? acct;
      const res = await fetch(TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: current.token.refresh,
          client_id: current.clientId,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new SpotifyError(401, "Spotify sign in for " + current.name + " expired. Sign in again in Settings.", "refresh_failed");
      }
      const token = {
        access: j.access_token as string,
        // Spotify may rotate the refresh token; keep the old one if it doesn't.
        refresh: (j.refresh_token as string) || current.token.refresh,
        exp: Date.now() + (j.expires_in ?? 3600) * 1000,
        scope: j.scope ?? current.token.scope,
      };
      updateToken(current.id, token);
      return token.access;
    })().finally(() => refreshing.delete(acct.id));
    refreshing.set(acct.id, p);
  }
  return p;
}

export async function accessToken(acct: SpotifyAccount): Promise<string> {
  const current = getAccounts().find((a) => a.id === acct.id) ?? acct;
  if (current.token.exp - Date.now() > 60_000) return current.token.access;
  return refresh(current);
}

type Query = Record<string, string | number | boolean | undefined | null>;

export async function sp<T = unknown>(
  acct: SpotifyAccount,
  path: string,
  init: { method?: string; body?: unknown; query?: Query } = {},
  attempt = 0,
): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : API + path);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const token = attempt > 0 && attempt < 2 ? await refresh(acct) : await accessToken(acct);
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: "Bearer " + token,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && attempt === 0) return sp<T>(acct, path, init, 1);
  if (res.status === 429 && attempt < 3) {
    const wait = Math.min(8, Number(res.headers.get("Retry-After") ?? "2")) * 1000;
    await sleep(wait);
    return sp<T>(acct, path, init, 3);
  }
  if (res.status === 204 || res.status === 202) return null as T;
  const text = await res.text();
  let j: unknown = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    j = null;
  }
  if (!res.ok) {
    const e = (j as { error?: { message?: string; reason?: string } } | null)?.error;
    throw new SpotifyError(res.status, friendly(res.status, e?.message, e?.reason), e?.reason);
  }
  return j as T;
}

function friendly(status: number, msg?: string, reason?: string): string {
  if (reason === "PREMIUM_REQUIRED") return "Spotify needs a Premium account to control playback.";
  if (reason === "NO_ACTIVE_DEVICE") return "No Spotify speaker is active. Pick a speaker first.";
  if (status === 404 && /device/i.test(msg ?? "")) return "That speaker went to sleep. Open Spotify on it, or pick another.";
  if (status === 403 && /restrict/i.test(msg ?? "")) return "Spotify doesn't allow the app to control that speaker.";
  return msg ? "Spotify: " + msg : "Spotify error " + status;
}

/* ---------- shapes ---------- */

export interface SpImage {
  url: string;
  width?: number | null;
  height?: number | null;
}
export interface SpArtist {
  id: string;
  uri: string;
  name: string;
  images?: SpImage[];
  genres?: string[];
}
export interface SpAlbum {
  id: string;
  uri: string;
  name: string;
  images?: SpImage[];
  artists: { id: string; name: string }[];
  release_date?: string;
  total_tracks?: number;
  album_type?: string;
  tracks?: { items: SpTrack[]; total?: number };
}
export interface SpTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  explicit?: boolean;
  artists: { id: string; name: string }[];
  album?: SpAlbum;
  track_number?: number;
  is_local?: boolean;
  type?: string;
}
export interface SpPlaylist {
  id: string;
  uri: string;
  name: string;
  description?: string;
  images?: SpImage[] | null;
  owner?: { id: string; display_name?: string };
  tracks?: { total?: number };
  items?: { total?: number };
}
export interface SpDevice {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
  is_private_session?: boolean;
  volume_percent: number | null;
  supports_volume?: boolean;
}
export interface SpPlayerState {
  device?: SpDevice;
  is_playing: boolean;
  progress_ms: number | null;
  item: SpTrack | null;
  shuffle_state?: boolean;
  repeat_state?: string;
  context?: { uri: string; type: string } | null;
  currently_playing_type?: string;
}

export const img = (images?: SpImage[] | null, small = false): string | null => {
  if (!images || !images.length) return null;
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  if (small) return (sorted.find((i) => (i.width ?? 999) <= 320) ?? sorted[sorted.length - 1]).url;
  return sorted[0].url;
};

const artistNames = (a: { name: string }[]) => a.map((x) => x.name).join(", ");

export function trackToItem(t: SpTrack): PlayItem {
  return {
    type: "spotify",
    kind: "track",
    uri: t.uri,
    id: t.id,
    title: t.name,
    subtitle: artistNames(t.artists) + (t.album ? " · " + t.album.name : ""),
    art: img(t.album?.images, true),
    artistName: t.artists[0]?.name,
    artistId: t.artists[0]?.id,
  };
}
export function albumToItem(a: SpAlbum): PlayItem {
  return {
    type: "spotify",
    kind: "album",
    uri: a.uri,
    id: a.id,
    title: a.name,
    subtitle: "Album · " + artistNames(a.artists) + (a.release_date ? " · " + a.release_date.slice(0, 4) : ""),
    art: img(a.images, true),
    artistName: a.artists[0]?.name,
    artistId: a.artists[0]?.id,
  };
}
export function artistToItem(a: SpArtist): PlayItem {
  return { type: "spotify", kind: "artist", uri: a.uri, id: a.id, title: a.name, subtitle: "Artist", art: img(a.images, true), artistName: a.name, artistId: a.id };
}
export function playlistToItem(p: SpPlaylist): PlayItem {
  const n = p.items?.total ?? p.tracks?.total;
  return {
    type: "spotify",
    kind: "playlist",
    uri: p.uri,
    id: p.id,
    title: p.name,
    subtitle: "Playlist" + (p.owner?.display_name ? " · " + p.owner.display_name : "") + (n ? " · " + n + " songs" : ""),
    art: img(p.images, true),
  };
}

/* ---------- search and browse ---------- */

export interface SearchResults {
  tracks: SpTrack[];
  artists: SpArtist[];
  albums: SpAlbum[];
  playlists: SpPlaylist[];
  totals: Record<string, number>;
}

type Page<T> = { items: (T | null)[]; total?: number; next?: string | null };

export async function search(acct: SpotifyAccount, q: string, types: SpotifyKind[] = ["track", "artist", "album", "playlist"], offset = 0): Promise<SearchResults> {
  const j = await sp<{ tracks?: Page<SpTrack>; artists?: Page<SpArtist>; albums?: Page<SpAlbum>; playlists?: Page<SpPlaylist> }>(acct, "/search", {
    query: { q, type: types.join(","), limit: 10, offset, market: "from_token" },
  });
  const clean = <T,>(p?: Page<T>) => (p?.items ?? []).filter((x): x is T => !!x);
  return {
    tracks: clean(j?.tracks),
    artists: clean(j?.artists),
    albums: clean(j?.albums),
    playlists: clean(j?.playlists),
    totals: {
      track: j?.tracks?.total ?? 0,
      artist: j?.artists?.total ?? 0,
      album: j?.albums?.total ?? 0,
      playlist: j?.playlists?.total ?? 0,
    },
  };
}

export async function getArtist(acct: SpotifyAccount, id: string) {
  return sp<SpArtist>(acct, "/artists/" + id);
}

export async function getArtistAlbums(acct: SpotifyAccount, id: string): Promise<SpAlbum[]> {
  const j = await sp<Page<SpAlbum>>(acct, "/artists/" + id + "/albums", {
    query: { include_groups: "album,single,compilation", limit: 10, market: "from_token" },
  });
  const seen = new Set<string>();
  return (j?.items ?? []).filter((a): a is SpAlbum => {
    if (!a) return false;
    const k = a.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Spotify removed "top tracks" for apps like this, so popular songs come from search. */
export async function artistTracks(acct: SpotifyAccount, name: string, pages = 2): Promise<SpTrack[]> {
  const out: SpTrack[] = [];
  const seen = new Set<string>();
  for (let p = 0; p < pages; p++) {
    const r = await search(acct, `artist:"${name.replace(/"/g, "")}"`, ["track"], p * 10);
    for (const t of r.tracks) {
      const k = t.name.toLowerCase().replace(/\s*[-(].*(remaster|live|version|mono|stereo).*$/i, "");
      if (seen.has(k)) continue;
      if (!t.artists.some((a) => a.name.toLowerCase() === name.toLowerCase())) continue;
      seen.add(k);
      out.push(t);
    }
    if (r.tracks.length < 10) break;
  }
  return out;
}

export async function getAlbum(acct: SpotifyAccount, id: string) {
  return sp<SpAlbum>(acct, "/albums/" + id, { query: { market: "from_token" } });
}

export async function getPlaylist(acct: SpotifyAccount, id: string) {
  return sp<SpPlaylist>(acct, "/playlists/" + id, { query: { fields: "id,uri,name,description,images,owner(id,display_name),tracks(total),items(total)" } }).catch(() =>
    sp<SpPlaylist>(acct, "/playlists/" + id),
  );
}

type PlItem = { track?: SpTrack | null; item?: SpTrack | null };

/** Playlist songs. Spotify renamed /tracks to /items in 2026, so try both. */
export async function playlistTracks(acct: SpotifyAccount, id: string, limit = 100): Promise<SpTrack[]> {
  let j: Page<PlItem> | null = null;
  try {
    j = await sp<Page<PlItem>>(acct, "/playlists/" + id + "/items", { query: { limit: Math.min(limit, 50), market: "from_token" } });
  } catch (e) {
    if (e instanceof SpotifyError && (e.status === 404 || e.status === 405)) {
      j = await sp<Page<PlItem>>(acct, "/playlists/" + id + "/tracks", { query: { limit: Math.min(limit, 50), market: "from_token" } });
    } else throw e;
  }
  const out: SpTrack[] = [];
  for (const row of j?.items ?? []) {
    const t = row?.track ?? row?.item;
    if (t && t.uri && !t.is_local && (t.type ?? "track") === "track") out.push(t);
  }
  return out;
}

export async function myPlaylists(acct: SpotifyAccount): Promise<SpPlaylist[]> {
  const j = await sp<Page<SpPlaylist>>(acct, "/me/playlists", { query: { limit: 50 } });
  return (j?.items ?? []).filter((p): p is SpPlaylist => !!p);
}

export async function recentlyPlayed(acct: SpotifyAccount): Promise<SpTrack[]> {
  const j = await sp<{ items: { track: SpTrack }[] }>(acct, "/me/player/recently-played", { query: { limit: 30 } });
  const seen = new Set<string>();
  return (j?.items ?? [])
    .map((x) => x.track)
    .filter((t) => {
      if (!t || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    })
    .slice(0, 12);
}

/* ---------- playback ---------- */

export async function devices(acct: SpotifyAccount): Promise<SpDevice[]> {
  const j = await sp<{ devices: SpDevice[] }>(acct, "/me/player/devices");
  return j?.devices ?? [];
}

export async function playerState(acct: SpotifyAccount): Promise<SpPlayerState | null> {
  return sp<SpPlayerState | null>(acct, "/me/player", { query: { market: "from_token" } });
}

export async function playOnDevice(
  acct: SpotifyAccount,
  deviceId: string,
  what: { uris?: string[]; context_uri?: string; offset?: { position: number } | { uri: string } },
) {
  try {
    await sp(acct, "/me/player/play", { method: "PUT", query: { device_id: deviceId }, body: what });
  } catch (e) {
    // A sleepy device often needs a transfer first.
    if (e instanceof SpotifyError && (e.status === 404 || e.reason === "NO_ACTIVE_DEVICE")) {
      await transfer(acct, deviceId, false);
      await sleep(600);
      await sp(acct, "/me/player/play", { method: "PUT", query: { device_id: deviceId }, body: what });
    } else throw e;
  }
}

export const resume = (acct: SpotifyAccount, deviceId: string) => sp(acct, "/me/player/play", { method: "PUT", query: { device_id: deviceId } });
export const pause = (acct: SpotifyAccount, deviceId: string) => sp(acct, "/me/player/pause", { method: "PUT", query: { device_id: deviceId } });
export const next = (acct: SpotifyAccount, deviceId: string) => sp(acct, "/me/player/next", { method: "POST", query: { device_id: deviceId } });
export const previous = (acct: SpotifyAccount, deviceId: string) => sp(acct, "/me/player/previous", { method: "POST", query: { device_id: deviceId } });
export const setVolume = (acct: SpotifyAccount, deviceId: string, v: number) =>
  sp(acct, "/me/player/volume", { method: "PUT", query: { volume_percent: Math.round(v), device_id: deviceId } });
export const transfer = (acct: SpotifyAccount, deviceId: string, play: boolean) =>
  sp(acct, "/me/player", { method: "PUT", body: { device_ids: [deviceId], play } });

/* ---------- turning anything into a list of songs ---------- */

/**
 * The songs to queue for an item. A single song keeps going with more from
 * the same artist, the way a radio would, since Spotify retired its
 * recommendations for apps like this.
 */
export async function resolveUris(acct: SpotifyAccount, item: Extract<PlayItem, { type: "spotify" }>, max = 40): Promise<{ uris: string[]; first?: string }> {
  switch (item.kind) {
    case "track": {
      const more = item.artistName ? await artistTracks(acct, item.artistName).catch(() => []) : [];
      const uris = [item.uri, ...more.map((t) => t.uri).filter((u) => u !== item.uri)].slice(0, max);
      return { uris, first: item.title };
    }
    case "album": {
      const a = await getAlbum(acct, item.id);
      const uris = (a.tracks?.items ?? []).map((t) => t.uri).slice(0, max);
      return { uris, first: a.tracks?.items?.[0]?.name };
    }
    case "playlist": {
      const t = await playlistTracks(acct, item.id, max);
      return { uris: t.map((x) => x.uri).slice(0, max), first: t[0]?.name };
    }
    case "artist": {
      const t = await artistTracks(acct, item.title, 3);
      return { uris: t.map((x) => x.uri).slice(0, max), first: t[0]?.name };
    }
  }
}

/* ---------- room playlists (search to Sonos without extra hardware) ---------- */

export const ROOM_PLAYLIST_PREFIX = "Compass Classics · ";
export const roomPlaylistName = (room: string) => ROOM_PLAYLIST_PREFIX + room;

export async function findPlaylistByName(acct: SpotifyAccount, name: string): Promise<SpPlaylist | null> {
  const list = await myPlaylists(acct);
  return list.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase() && p.owner?.id === acct.id) ?? null;
}

export async function createPlaylist(acct: SpotifyAccount, name: string, description: string): Promise<SpPlaylist> {
  const body = { name, description, public: false };
  try {
    return await sp<SpPlaylist>(acct, "/me/playlists", { method: "POST", body });
  } catch (e) {
    if (e instanceof SpotifyError && (e.status === 404 || e.status === 405)) {
      return sp<SpPlaylist>(acct, "/users/" + encodeURIComponent(acct.id) + "/playlists", { method: "POST", body });
    }
    throw e;
  }
}

/** Swap everything in a playlist for these songs (up to 100). */
export async function replacePlaylist(acct: SpotifyAccount, id: string, uris: string[]) {
  const body = { uris: uris.slice(0, 100) };
  try {
    await sp(acct, "/playlists/" + id + "/items", { method: "PUT", body });
  } catch (e) {
    if (e instanceof SpotifyError && (e.status === 404 || e.status === 405)) {
      await sp(acct, "/playlists/" + id + "/tracks", { method: "PUT", body });
    } else throw e;
  }
}
