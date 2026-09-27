/*
 * Sonos, through our own server. The server holds the Sonos sign-in in an
 * encrypted cookie and passes commands to the official Sonos cloud API, so
 * this works from anywhere, not just on Dad's Wi-Fi.
 */

import type { SonosFavorite, SonosPlaylist, SonosSnapshot } from "./types";

export class SonosError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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
    const o = j as { error?: string; errorCode?: string; reason?: string } | null;
    throw new SonosError(res.status, o?.error || o?.reason || o?.errorCode || "Sonos error " + res.status);
  }
  return j as T;
}

export async function snapshot(householdId?: string): Promise<SonosSnapshot | null> {
  const res = await fetch("/api/sonos/state" + (householdId ? "?hh=" + encodeURIComponent(householdId) : ""), { cache: "no-store" });
  if (res.status === 401) return null;
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new SonosError(res.status, (j && j.error) || "Could not reach Sonos (" + res.status + ")");
  return j as SonosSnapshot;
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
