/*
 * "This device": the Spotify Web Playback SDK turns this browser into a
 * Spotify speaker. On a PC, sound comes out of whatever the PC plays through,
 * so a Bluetooth speaker or an amp plugged into the PC works too.
 */

type Listener = (s: BrowserPlayerStatus) => void;

export interface BrowserPlayerStatus {
  state: "off" | "loading" | "ready" | "error";
  deviceId?: string;
  error?: string;
  paused?: boolean;
  track?: { title: string; artist: string; art?: string | null; durationMs: number } | null;
  positionMs?: number;
  at?: number;
}

let sdkLoading: Promise<void> | null = null;
let player: Spotify.Player | null = null;
let status: BrowserPlayerStatus = { state: "off" };
const listeners = new Set<Listener>();

function emit(patch: Partial<BrowserPlayerStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((f) => f(status));
}

export function onBrowserPlayer(fn: Listener) {
  listeners.add(fn);
  fn(status);
  return () => {
    listeners.delete(fn);
  };
}

export const browserPlayerStatus = () => status;

/** For useSyncExternalStore. */
export function subscribeBrowserPlayer(cb: () => void) {
  const f: Listener = () => cb();
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.Spotify) return Promise.resolve();
  if (!sdkLoading) {
    sdkLoading = new Promise<void>((resolve, reject) => {
      window.onSpotifyWebPlaybackSDKReady = () => resolve();
      const s = document.createElement("script");
      s.src = "https://sdk.scdn.co/spotify-player.js";
      s.async = true;
      s.onerror = () => {
        sdkLoading = null;
        reject(new Error("Could not load the Spotify player. Check the connection and try again."));
      };
      document.head.appendChild(s);
    });
  }
  return sdkLoading;
}

/**
 * Start the in-browser speaker. Call from a click so browsers allow sound
 * (Safari and iOS need the gesture to unlock audio).
 */
export async function startBrowserPlayer(getToken: () => Promise<string>, name: string): Promise<void> {
  if (player && status.state === "ready") return;
  emit({ state: "loading", error: undefined });
  try {
    await loadSdk();
  } catch (e) {
    emit({ state: "error", error: (e as Error).message });
    return;
  }
  const p = new window.Spotify.Player({
    name,
    getOAuthToken: (cb) => {
      getToken().then(cb, () => emit({ state: "error", error: "Spotify sign in expired. Sign in again in Settings." }));
    },
    volume: 0.8,
  });
  player = p;
  p.addListener("ready", ({ device_id }) => emit({ state: "ready", deviceId: device_id, error: undefined }));
  p.addListener("not_ready", () => emit({ state: "loading" }));
  p.addListener("initialization_error", ({ message }) =>
    emit({ state: "error", error: "This browser can't run the Spotify player (" + message + "). Chrome, Edge, or Safari on a computer works best." }),
  );
  p.addListener("authentication_error", () => emit({ state: "error", error: "Spotify sign in expired. Sign in again in Settings." }));
  p.addListener("account_error", () => emit({ state: "error", error: "Playing in the browser needs Spotify Premium." }));
  p.addListener("playback_error", ({ message }) => emit({ error: message }));
  p.addListener("player_state_changed", (s) => {
    if (!s) {
      emit({ track: null, paused: true });
      return;
    }
    const t = s.track_window.current_track;
    emit({
      paused: s.paused,
      positionMs: s.position,
      at: Date.now(),
      track: t
        ? {
            title: t.name,
            artist: t.artists.map((a) => a.name).join(", "),
            art: t.album.images?.[0]?.url ?? null,
            durationMs: s.duration,
          }
        : null,
    });
  });
  try {
    // Unlocks audio on Safari and mobile browsers; harmless elsewhere.
    await p.activateElement?.();
  } catch {
    /* not supported everywhere */
  }
  const ok = await p.connect();
  if (!ok) emit({ state: "error", error: "The Spotify player could not connect." });
}

export async function stopBrowserPlayer() {
  try {
    player?.disconnect();
  } catch {
    /* already gone */
  }
  player = null;
  emit({ state: "off", deviceId: undefined, track: null });
}

export async function browserSetVolume(v: number) {
  await player?.setVolume(Math.max(0, Math.min(1, v / 100)));
}

/** A short chime through this device's speakers, to check the sound path. */
export async function testTone(): Promise<void> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const t0 = ctx.currentTime + 0.05;
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t0 + i * 0.16);
    g.gain.linearRampToValueAtTime(0.25, t0 + i * 0.16 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.16 + 0.6);
    o.connect(g).connect(ctx.destination);
    o.start(t0 + i * 0.16);
    o.stop(t0 + i * 0.16 + 0.65);
  });
  await new Promise((r) => setTimeout(r, 1400));
  await ctx.close();
}
