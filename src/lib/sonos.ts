/*
 * Sonos, through our own server. The server holds the Sonos sign-in in an
 * encrypted cookie and passes commands to the official Sonos cloud API, so
 * this works from anywhere, not just on Dad's Wi-Fi.
 */

import type { SonosFavorite, SonosPlaylist, SonosSnapshot } from "./types";

export class SonosError extends Error {
  status: number;
  errorCode = "";
  /** Seconds Sonos asked us to wait, when it rate limited us. */
  retryAfter = 0;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/*
 * Sonos gives each home a small request budget. When it says "slow down",
 * every part of the app (polling, favorites, taps) waits together.
 */
let limitedUntil = 0;
let backoffSec = 0;
let resetsAt = 0;
let budget: { remaining: number; reset: number; at: number } | null = null;
export function noteRateLimit(retryAfterSec = 0) {
  backoffSec = Math.min(backoffSec ? backoffSec * 2 : 30, 300);
  // A long wait means the daily budget ran out; still peek every 10 minutes.
  if (retryAfterSec > 600) resetsAt = Date.now() + retryAfterSec * 1000;
  const wait = Math.min(Math.max(retryAfterSec, backoffSec), 600);
  limitedUntil = Math.max(limitedUntil, Date.now() + wait * 1000);
}
export function noteSonosOk() {
  backoffSec = 0;
  resetsAt = 0;
}
export const rateLimitedFor = () => Math.max(0, limitedUntil - Date.now());
/** When the daily budget comes back (0 if it isn't used up). */
export const budgetResetsAt = () => (resetsAt > Date.now() ? resetsAt : 0);

/**
 * How long to wait between polls so the daily budget lasts until it resets,
 * even with the app left open all day: calls per poll x seconds left / calls left.
 */
export function pollPaceMs(callsPerPoll: number): number {
  if (!budget) return 10000;
  const secsLeft = Math.max(60, budget.reset - (Date.now() - budget.at) / 1000);
  const pace = (callsPerPoll * secsLeft * 1000) / Math.max(1, budget.remaining);
  return Math.min(180000, Math.max(10000, pace));
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch("/api/sonos/v1/" + path, {
    method: init.method ?? "GET",
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let j: unknown = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    j = null;
  }
  if (!res.ok) {
    const o = j as { error?: string; errorCode?: string; reason?: string; retryAfter?: number } | null;
    const err = new SonosError(
      res.status,
      o?.error || o?.reason || o?.errorCode || (res.status === 429 ? "Sonos is asking apps to slow down. Try again in a minute." : "Sonos error " + res.status),
    );
    err.errorCode = o?.errorCode ?? "";
    err.retryAfter = Number(o?.retryAfter) || 0;
    if (res.status === 429) noteRateLimit(err.retryAfter);
    throw err;
  }
  noteSonosOk();
  return j as T;
}

export async function snapshot(householdId?: string, withVolumes = true, withDetail = true): Promise<SonosSnapshot | null> {
  const q = new URLSearchParams();
  if (householdId) q.set("hh", householdId);
  if (withVolumes) q.set("vol", "1");
  if (!withDetail) q.set("detail", "0");
  const res = await fetch("/api/sonos/state" + (q.size ? "?" + q.toString() : ""), { cache: "no-store" });
  if (res.status === 401) return null;
  const j = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new SonosError(res.status, (j && j.error) || "Could not reach Sonos (" + res.status + ")");
    (err as SonosError & { staleHousehold?: boolean }).staleHousehold = !!(j && j.staleHousehold);
    err.retryAfter = Number(j?.retryAfter) || 0;
    if (res.status === 429) noteRateLimit(err.retryAfter);
    throw err;
  }
  const s = j as SonosSnapshot;
  if (s.budget) budget = { ...s.budget, at: Date.now() };
  // A partly rate-limited snapshot still counts as a warning to slow down.
  if (s.limited) noteRateLimit(Number(s.retryAfter) || 0);
  else noteSonosOk();
  return s;
}

export const togglePlay = (groupId: string) => call("groups/" + groupId + "/playback/togglePlayPause", { method: "POST", body: {} });
export const play = (groupId: string) => call("groups/" + groupId + "/playback/play", { method: "POST", body: {} });
export const pause = (groupId: string) => call("groups/" + groupId + "/playback/pause", { method: "POST", body: {} });
export const skipNext = (groupId: string) => call("groups/" + groupId + "/playback/skipToNextTrack", { method: "POST", body: {} });
export const skipPrev = (groupId: string) => call("groups/" + groupId + "/playback/skipToPreviousTrack", { method: "POST", body: {} });
export const setPlayModes = (groupId: string, playModes: { shuffle?: boolean; repeat?: boolean }) =>
  call("groups/" + groupId + "/playback/playMode", { method: "POST", body: { playModes } });

export const setPlayerVolume = (playerId: string, volume: number) =>
  call("players/" + playerId + "/playerVolume", { method: "POST", body: { volume: Math.round(volume) } });
export const setGroupVolume = (groupId: string, volume: number) =>
  call("groups/" + groupId + "/groupVolume", { method: "POST", body: { volume: Math.round(volume) } });

export async function createGroup(householdId: string, playerIds: string[], musicContextGroupId?: string) {
  const j = await call<{ group: { id: string; coordinatorId: string; playerIds: string[] } }>(
    "households/" + householdId + "/groups/createGroup",
    { method: "POST", body: musicContextGroupId ? { playerIds, musicContextGroupId } : { playerIds } },
  );
  return j.group;
}

export const modifyGroup = (groupId: string, add: string[], remove: string[]) =>
  call<{ group: { id: string } }>("groups/" + groupId + "/groups/modifyGroupMembers", {
    method: "POST",
    body: { playerIdsToAdd: add, playerIdsToRemove: remove },
  });

export async function favorites(householdId: string): Promise<SonosFavorite[]> {
  const j = await call<{ items?: SonosFavorite[] }>("households/" + householdId + "/favorites");
  return j?.items ?? [];
}

export async function playlists(householdId: string): Promise<SonosPlaylist[]> {
  const j = await call<{ playlists?: SonosPlaylist[] }>("households/" + householdId + "/playlists");
  return j?.playlists ?? [];
}

export const loadFavorite = (groupId: string, favoriteId: string) =>
  call("groups/" + groupId + "/favorites", {
    method: "POST",
    body: { favoriteId, action: "REPLACE", playOnCompletion: true },
  });

export const loadPlaylist = (groupId: string, playlistId: string) =>
  call("groups/" + groupId + "/playlists", {
    method: "POST",
    body: { playlistId, action: "REPLACE", playOnCompletion: true },
  });

export async function unlink() {
  await fetch("/api/sonos/logout", { method: "POST" });
}
