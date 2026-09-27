"use client";

import { useEffect } from "react";

/*
 * Home screen apps on iPhone keep running the copy they opened with. When the
 * app comes back after being away for a while, ask which build is live and
 * reload if it's newer. Never while it's in use: no reloads on focus changes,
 * only after the app was in the background for at least 2 minutes.
 */

const RUNNING = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
const AWAY_MS = 2 * 60 * 1000;

async function liveBuild(): Promise<string | null> {
  try {
    const r = await fetch("/api/version", { cache: "no-store" });
    const j = (await r.json()) as { build?: string };
    return j.build ?? null;
  } catch {
    return null;
  }
}

export function useSelfUpdate() {
  useEffect(() => {
    if (RUNNING === "dev") return;
    let hiddenAt = 0;
    const onVisibility = async () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (!hiddenAt || Date.now() - hiddenAt < AWAY_MS) return;
      hiddenAt = 0;
      const live = await liveBuild();
      if (live && live !== "dev" && live !== RUNNING) location.reload();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
}
