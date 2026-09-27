"use client";

/*
 * Card glow from the album art: sample the cover, pick its most vivid color,
 * and nudge it bright enough to glow on navy. Falls back to a stable color
 * when an image can't be read (some hosts block it).
 */

import { useEffect, useSyncExternalStore } from "react";
import { glowFor } from "./util";

const cache = new Map<string, string>();
const pending = new Set<string>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

const isRgb = (s: string) => /^\d{1,3},\s*\d{1,3},\s*\d{1,3}$/.test(s);
const isUrl = (s: string) => /^https?:\/\//.test(s);

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}

function extract(url: string) {
  pending.add(url);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.onload = () => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 16;
      const x = c.getContext("2d", { willReadFrequently: true })!;
      x.drawImage(img, 0, 0, 16, 16);
      const d = x.getImageData(0, 0, 16, 16).data;
      let R = 0;
      let G = 0;
      let B = 0;
      let W = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
        const w = s * s * (1 - Math.abs(l - 0.5) * 1.6) + 0.02;
        R += d[i] * w;
        G += d[i + 1] * w;
        B += d[i + 2] * w;
        W += w;
      }
      const [h, s, l] = rgbToHsl(R / W, G / W, B / W);
      const [r, g, b] = hslToRgb(h, Math.max(0.55, Math.min(0.9, s * 1.3)), Math.max(0.5, Math.min(0.64, l)));
      cache.set(url, `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`);
    } catch {
      cache.set(url, glowFor(url));
    }
    emit();
  };
  img.onerror = () => {
    cache.set(url, glowFor(url));
    emit();
  };
  img.src = url;
}

export function useGlow(seed: string): string {
  const got = useSyncExternalStore(
    subscribe,
    () => cache.get(seed) ?? null,
    () => null,
  );
  useEffect(() => {
    if (isUrl(seed) && !cache.has(seed) && !pending.has(seed)) extract(seed);
  }, [seed]);
  if (isRgb(seed)) return seed;
  return got ?? glowFor(seed);
}
