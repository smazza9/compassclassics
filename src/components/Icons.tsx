/* Line icon set, 24px grid, drawn to match the True North prototype. */

import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  play: <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l10-6.2c.6-.4.6-1.4 0-1.8l-10-6.2C8.9 4.5 8 5 8 5.8z" fill="currentColor" />,
  pause: (
    <>
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </>
  ),
  next: (
    <>
      <path d="M5 6.6v10.8c0 .8.9 1.3 1.5.8l7.8-5.4c.6-.4.6-1.2 0-1.6L6.5 5.8C5.9 5.3 5 5.8 5 6.6z" fill="currentColor" />
      <rect x="16" y="5.5" width="2.6" height="13" rx="1.1" fill="currentColor" />
    </>
  ),
  prev: (
    <>
      <path d="M19 6.6v10.8c0 .8-.9 1.3-1.5.8l-7.8-5.4c-.6-.4-.6-1.2 0-1.6l7.8-5.4c.6-.5 1.5 0 1.5.8z" fill="currentColor" />
      <rect x="5.4" y="5.5" width="2.6" height="13" rx="1.1" fill="currentColor" />
    </>
  ),
  power: <path d="M12 3.5v7.5M6.4 7a7.5 7.5 0 1 0 11.2 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="15" cy="7" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="17" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  eq: (
    <>
      <path d="M6 20v-6M6 10V4M12 20v-9M12 7V4M18 20v-4M18 12V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3.5 14h5M9.5 7h5M15.5 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  music: (
    <>
      <path d="M9 17.5V6.2L19 4v11.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="6.5" cy="17.5" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="15.3" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-4.4-4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  chevL: <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  chevR: <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  chevD: <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  speaker: (
    <>
      <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  flame: <path d="M12 3.5c.6 3.2 4.8 5 4.8 9.6A4.8 4.8 0 0 1 12 18a4.8 4.8 0 0 1-4.8-4.9c0-2 .9-3.4 2.1-4.5.2 1.3.8 2.2 1.6 2.8.2-2.9 0-5.4 1.1-7.9z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  wrench: <path d="M14.8 5.2a4.2 4.2 0 0 0-5.3 5.3l-5.2 5.2a1.8 1.8 0 0 0 2.5 2.5l5.2-5.2a4.2 4.2 0 0 0 5.3-5.3l-2.7 2.7-2.3-.5-.5-2.3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  moon: <path d="M19.5 14.2A7.8 7.8 0 1 1 9.8 4.5a6.3 6.3 0 0 0 9.7 9.7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  house: (
    <>
      <path d="M3.5 11.5 12 4.5l8.5 7M6 10v9.5h12V10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 19.5V15h4v4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  split: <path d="M9 7 4.5 12 9 17M15 7l4.5 5L15 17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />,
  plus: <path d="M12 5.5v13M5.5 12h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  check: <path d="m5.5 12.5 4 4 9-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  shuffle: <path d="M3.5 7h3.2c1.4 0 2.7.7 3.5 1.8l3.6 6.4c.8 1.1 2.1 1.8 3.5 1.8h3.2M3.5 17h3.2c1.2 0 2.3-.5 3.1-1.4M13.8 8.4c.8-.9 1.9-1.4 3.1-1.4h3.6M18 4.5 20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  repeat: <path d="M4.5 11V9.5A3.5 3.5 0 0 1 8 6h11.5M16.5 3l3 3-3 3M19.5 13v1.5A3.5 3.5 0 0 1 16 18H4.5M7.5 21l-3-3 3-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  sparkle: (
    <>
      <path d="M12 3.5c.5 3.9 2.6 6 6.5 6.5-3.9.5-6 2.6-6.5 6.5-.5-3.9-2.6-6-6.5-6.5 3.9-.5 6-2.6 6.5-6.5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M18.5 15.5c.2 1.6 1 2.4 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.1 2.3-.9 2.5-2.5z" fill="currentColor" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  send: <path d="M4.5 12 19.5 5l-4.2 14-3.3-5.8zM12 13.2l7.5-8.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  computer: (
    <>
      <rect x="3.5" y="5" width="17" height="11" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 19.5h7M12 16v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.5 18h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="5.5" width="18" height="11.5" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 20h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  amp: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13 10.5h5M13 13.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  hub: (
    <>
      <rect x="4" y="9" width="16" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 13.5h.01M12 13.5h.01" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M8.5 6a5 5 0 0 1 7 0M6.5 4a8 8 0 0 1 11 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  bluetooth: <path d="m7 7.5 10 9-5 4.5v-18l5 4.5-10 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  radio: (
    <>
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M8 8a5.6 5.6 0 0 0 0 8M16 8a5.6 5.6 0 0 1 0 8M5.2 5.2a9.6 9.6 0 0 0 0 13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v5.5M12 7.8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  share: <path d="M12 15V4M8 7.5 12 3.5l4 4M6 11v8.5h12V11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  album: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  list: <path d="M8.5 7h11M8.5 12h11M8.5 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />,
  wave: <path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />,
};

export type IconName = keyof typeof P;

export function Icon({ name, className, title }: { name: string; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden={title ? undefined : true} role={title ? "img" : undefined} focusable="false">
      {title ? <title>{title}</title> : null}
      {P[name] ?? P.music}
    </svg>
  );
}

/** The Compass nod: a compass needle, north tip in Compass yellow. */
export function Needle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="currentColor" strokeOpacity=".15" />
      <path d="M16 3.8 19.2 16h-6.4z" fill="#fdd431" />
      <path d="M16 28.2 12.8 16h6.4z" fill="currentColor" fillOpacity=".55" />
      <circle cx="16" cy="16" r="1.7" fill="#0f1419" />
    </svg>
  );
}

/** Playing indicator bars. */
export function EqBars() {
  return (
    <span className="eqbars" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function deviceIcon(type: string | undefined): string {
  const t = (type ?? "").toLowerCase();
  if (t.includes("computer")) return "computer";
  if (t.includes("smartphone") || t.includes("tablet")) return "phone";
  if (t.includes("tv") || t.includes("castvideo")) return "tv";
  if (t.includes("avr") || t.includes("stb") || t.includes("audiodongle") || t.includes("gameconsole")) return "amp";
  return "speaker";
}
