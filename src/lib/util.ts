/** Small helpers shared by the client code. */

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 3:07 style time from milliseconds. */
export function fmtMs(ms: number | null | undefined): string {
  if (ms == null || !isFinite(ms)) return "0:00";
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

/** Lowercase letters and digits only, single spaces. For forgiving name matching. */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Stable small hash, used to pick a glow color for a room or record. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Warm, saturated glows that sit well on the navy cards ("r, g, b"). */
const GLOWS = [
  "232, 90, 110",
  "214, 129, 64",
  "253, 212, 49",
  "34, 186, 178",
  "63, 167, 201",
  "240, 150, 110",
  "120, 140, 210",
  "176, 112, 214",
  "96, 196, 120",
];
export const glowFor = (seed: string) => GLOWS[hash(seed) % GLOWS.length];

/** "Living Room + Patio", "Living Room, Patio and Garage" */
export function joinNames(names: string[], joiner = " + "): string {
  return names.join(joiner);
}

export function listWords(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return names[0] + " and " + names[1];
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

/** localStorage that never throws (private mode, blocked storage). */
export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  },
  del(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  },
};

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Collapse a burst of calls into one trailing call (volume sliders). */
export function trailing<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  let last: A | null = null;
  return (...a: A) => {
    last = a;
    if (t) return;
    t = setTimeout(() => {
      t = null;
      if (last) fn(...last);
    }, ms);
  };
}
