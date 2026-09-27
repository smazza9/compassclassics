"use client";

import { useEffect } from "react";

/*
 * Home screen apps on iPhone keep running the copy they opened with. When the
 * app comes back on screen, ask which build is live and reload if it's newer,
 * so every fix shows up without anyone force-closing the app.
 */

const RUNNING = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

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
    let busy = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      const live = await liveBuild();
      busy = false;
      if (live && live !== "dev" && live !== RUNNING) location.reload();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    const first = setTimeout(check, 3000);
    const every = setInterval(check, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
}
