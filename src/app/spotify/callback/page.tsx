"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { finishLogin } from "@/lib/spotify";

/* Spotify sends the browser back here after sign in. Finish it and go home. */
export default function SpotifyCallback() {
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    finishLogin(new URLSearchParams(location.search))
      .then(({ returnTo }) => {
        const url = new URL(returnTo || "/", location.origin);
        url.searchParams.set("spotify", "linked");
        location.replace(url.pathname + url.search);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  return (
    <div className="splash">
      <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
        {err ? (
          <>
            <p style={{ fontSize: 16, fontWeight: 600 }}>Spotify didn&apos;t connect</p>
            <p style={{ color: "var(--fg2)", fontSize: 14, lineHeight: 1.6 }}>{err}</p>
            <Link className="btn gold" href="/?view=settings" style={{ textDecoration: "none", marginTop: 12 }}>
              Back to Settings
            </Link>
          </>
        ) : (
          <p style={{ color: "var(--fg2)" }}>
            <span className="spin" /> Connecting Spotify…
          </p>
        )}
      </div>
    </div>
  );
}
