"use client";

import { useSyncExternalStore } from "react";

/* A shared one second clock, so progress bars keep moving between polls. */
let nowVal = 0;
const clockSubs = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(cb: () => void) {
  clockSubs.add(cb);
  if (!clockTimer) {
    nowVal = Date.now();
    clockTimer = setInterval(() => {
      nowVal = Date.now();
      clockSubs.forEach((f) => f());
    }, 1000);
  }
  return () => {
    clockSubs.delete(cb);
    if (!clockSubs.size && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

export const useNow = () =>
  useSyncExternalStore(
    subscribeClock,
    () => nowVal,
    () => 0,
  );

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

export const useVisible = () =>
  useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => true,
  );

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
