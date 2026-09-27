/*
 * The home hub: a small program on a computer at the house (see /hub). It
 * talks to the Sonos speakers over the local network, which is the only way
 * to change EQ and to start any Spotify song on Sonos.
 */

import type { EqState } from "./types";
import { store } from "./util";

export interface HubConfig {
  url: string;
  key: string;
}

export interface HubRoom {
  id: string;
  name: string;
  model?: string;
  ip?: string;
  coordinatorId?: string;
  isCoordinator?: boolean;
  memberIds?: string[];
  hasSub?: boolean;
  isHomeTheater?: boolean;
}

const KEY = "cc.hub";

export const getHubConfig = () => store.get<HubConfig | null>(KEY, null);
export const setHubConfig = (c: HubConfig | null) => (c ? store.set(KEY, c) : store.del(KEY));

export class HubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function hub<T>(cfg: HubConfig, path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const base = cfg.url.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(base + path, {
      method: init.method ?? "GET",
      headers: {
        "X-Hub-Key": cfg.key,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init.timeoutMs ?? 8000),
      cache: "no-store",
    });
  } catch {
    const local = /^http:\/\/(127\.|localhost|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(base);
    throw new HubError(
      0,
      "Can't reach the home hub at " +
        base +
        ". Check the hub window is open." +
        (local && location.protocol === "https:"
          ? " If the browser asked to let this site reach apps or devices on your network, choose Allow (the lock icon in the address bar can change it)."
          : ""),
    );
  }
  const j = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) throw new HubError(401, "The hub key doesn't match. Copy it again from the hub window.");
    throw new HubError(res.status, (j && j.error) || "Hub error " + res.status);
  }
  return j as T;
}

export const hubPing = (cfg: HubConfig) => hub<{ ok: boolean; version: string; mock: boolean }>(cfg, "/ping", { timeoutMs: 4000 });
export const hubStatus = (cfg: HubConfig) =>
  hub<{ ok: boolean; version: string; mock: boolean; players: number; lastScan: string | null }>(cfg, "/status");
export const hubRooms = (cfg: HubConfig) => hub<{ rooms: HubRoom[] }>(cfg, "/rooms").then((j) => j.rooms ?? []);
export const hubRescan = (cfg: HubConfig) => hub<{ rooms: HubRoom[] }>(cfg, "/rescan", { method: "POST", body: {}, timeoutMs: 15000 }).then((j) => j.rooms ?? []);
export const hubGetEq = (cfg: HubConfig, roomId: string) => hub<EqState & { roomId: string }>(cfg, "/eq/" + encodeURIComponent(roomId));
export const hubSetEq = (cfg: HubConfig, roomId: string, patch: Partial<EqState>) =>
  hub<EqState & { roomId: string }>(cfg, "/eq/" + encodeURIComponent(roomId), { method: "POST", body: patch });
export const hubPlay = (cfg: HubConfig, roomId: string, uri: string, mode: "replace" | "next" | "append" = "replace") =>
  hub<{ ok: boolean }>(cfg, "/play/" + encodeURIComponent(roomId), { method: "POST", body: { uri, mode }, timeoutMs: 15000 });
