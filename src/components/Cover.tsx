"use client";

/* Album art: a real image when we have one, otherwise a generated cover. */

import { useId, useState } from "react";
import { hash } from "@/lib/util";

function Words({ lines, fill, size }: { lines: string[]; fill: string; size: number }) {
  return (
    <>
      {lines.map((l, k) => (
        <text
          key={k}
          x="9"
          y={(91 - (lines.length - 1 - k) * (size - 1)).toFixed(1)}
          fill={fill}
          fontFamily="var(--font-display), Barlow Condensed, Arial Narrow, sans-serif"
          fontWeight="700"
          fontSize={size}
          letterSpacing=".3"
        >
          {l}
        </text>
      ))}
    </>
  );
}

/** The seven example covers from the prototype, plus a generic one for anything else. */
export function GenCover({ art, words = false, label }: { art: string; words?: boolean; label?: string }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  let body: React.ReactNode;
  switch (art) {
    case "sunset":
      body = (
        <>
          <defs>
            <linearGradient id={u} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
              <stop offset="0" stopColor="#ffa545" />
              <stop offset=".52" stopColor="#df3c6c" />
              <stop offset="1" stopColor="#321858" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill={`url(#${u})`} />
          <circle cx="64" cy="38" r="25" fill="#ffd66e" />
          {[40, 45.5, 50.5, 55, 59].map((y, k) => (
            <rect key={y} x="36" y={y} width="64" height={(1.2 + k * 0.95).toFixed(2)} fill={`url(#${u})`} />
          ))}
          <path d="M0 70 100 58V100H0Z" fill="#2a134d" opacity=".62" />
          {words && <Words lines={["CLASSIC ROCK", "DRIVE"]} fill="#fff" size={14} />}
        </>
      );
      break;
    case "vinyl":
      body = (
        <>
          <defs>
            <radialGradient id={u} cx=".25" cy=".2" r="1">
              <stop offset="0" stopColor="#e2934e" />
              <stop offset="1" stopColor="#5c2814" />
            </radialGradient>
          </defs>
          <rect width="100" height="100" fill={`url(#${u})`} />
          <circle cx="66" cy="36" r="30" fill="#1c1310" />
          {[26, 21.5, 17].map((r) => (
            <circle key={r} cx="66" cy="36" r={r} fill="none" stroke="#fff" strokeOpacity=".09" strokeWidth=".8" />
          ))}
          <circle cx="66" cy="36" r="9.5" fill="#f3c46a" />
          <circle cx="66" cy="36" r="1.6" fill="#1c1310" />
          {words && <Words lines={["PATIO", "COUNTRY"]} fill="#fff5e6" size={16} />}
        </>
      );
      break;
    case "caution":
      body = (
        <>
          <defs>
            <pattern id={u} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="10" height="10" fill="#111317" />
              <rect width="5" height="10" fill="#fdd431" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="#15171c" />
          <rect y="14" width="100" height="18" fill={`url(#${u})`} />
          <rect y="36" width="100" height="4" fill={`url(#${u})`} opacity=".8" />
          <path d="M80 46 70 62h7l-5 14 15-19h-8l5-11z" fill="#fdd431" />
          {words && <Words lines={["GARAGE", "ROCK"]} fill="#fdd431" size={21} />}
        </>
      );
      break;
    case "waves":
      body = (
        <>
          <defs>
            <linearGradient id={u} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2cc7b8" />
              <stop offset="1" stopColor="#0b4a68" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill={`url(#${u})`} />
          <circle cx="74" cy="22" r="12" fill="#ffe7a3" />
          {[34, 42, 50, 58].map((y, k) => (
            <path
              key={y}
              d={`M-4 ${y} C8 ${y - 5} 20 ${y + 5} 32 ${y} S56 ${y - 5} 68 ${y} S92 ${y + 5} 104 ${y}`}
              fill="none"
              stroke="#fff"
              strokeOpacity={(0.5 - k * 0.1).toFixed(2)}
              strokeWidth="2.2"
            />
          ))}
          {words && <Words lines={["CAROLINA", "BEACH MUSIC"]} fill="#fff" size={14} />}
        </>
      );
      break;
    case "sail":
      body = (
        <>
          <defs>
            <linearGradient id={u} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5cc3df" />
              <stop offset=".62" stopColor="#1f6f98" />
              <stop offset=".62" stopColor="#0f3556" />
              <stop offset="1" stopColor="#0a2540" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill={`url(#${u})`} />
          <path d="M57 6V53H30Z" fill="#f6f1e7" />
          <path d="M61 13V53H82Z" fill="#ffcf9e" />
          <rect x="58" y="4" width="2" height="51" fill="#0f3556" />
          <path d="M30 55H86L80 62H36Z" fill="#f6f1e7" />
          {words && <Words lines={["YACHT", "ROCK"]} fill="#fff" size={17} />}
        </>
      );
      break;
    case "sunrise":
      body = (
        <>
          <defs>
            <linearGradient id={u} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f8dcae" />
              <stop offset="1" stopColor="#df7a5d" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill={`url(#${u})`} />
          <circle cx="68" cy="34" r="22" fill="#fff4dc" opacity=".92" />
          {Array.from({ length: 8 }, (_, k) => {
            const a = (k / 8) * Math.PI * 2;
            return (
              <line
                key={k}
                x1={(68 + Math.cos(a) * 27).toFixed(1)}
                y1={(34 + Math.sin(a) * 27).toFixed(1)}
                x2={(68 + Math.cos(a) * 33).toFixed(1)}
                y2={(34 + Math.sin(a) * 33).toFixed(1)}
                stroke="#fff4dc"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".8"
              />
            );
          })}
          {words && <Words lines={["SUNDAY", "MORNING SOUL"]} fill="#4a2216" size={13} />}
        </>
      );
      break;
    case "radio":
      body = (
        <>
          <rect width="100" height="100" fill="#1b2538" />
          {[7, 15, 23, 31, 39].map((r, k) => (
            <circle key={r} cx="30" cy="36" r={r} fill="none" stroke="#fdd431" strokeOpacity={(0.85 - k * 0.15).toFixed(2)} strokeWidth="2" />
          ))}
          <circle cx="30" cy="36" r="3.5" fill="#fdd431" />
          <rect x="68" y="9" width="23" height="11" rx="3" fill="#ef4444" />
          <text x="79.5" y="17.6" textAnchor="middle" fill="#fff" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="7" letterSpacing=".6">
            LIVE
          </text>
          {words && <Words lines={["CLASSIC ROCK", "RADIO"]} fill="#fff" size={14} />}
        </>
      );
      break;
    default: {
      // A record on a warm gradient, colored by the name so each looks different.
      const h = hash(label ?? art);
      const hue = h % 360;
      const hue2 = (hue + 40) % 360;
      body = (
        <>
          <defs>
            <linearGradient id={u} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={`hsl(${hue} 62% 52%)`} />
              <stop offset="1" stopColor={`hsl(${hue2} 58% 22%)`} />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill={`url(#${u})`} />
          <circle cx="62" cy="40" r="28" fill="#141414" opacity=".88" />
          {[23, 18.5, 14].map((r) => (
            <circle key={r} cx="62" cy="40" r={r} fill="none" stroke="#fff" strokeOpacity=".1" strokeWidth=".8" />
          ))}
          <circle cx="62" cy="40" r="8" fill="#fdd431" />
          <circle cx="62" cy="40" r="1.4" fill="#141414" />
          {words && label ? <Words lines={[label.toUpperCase().slice(0, 16)]} fill="#fff" size={14} /> : null}
        </>
      );
    }
  }
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {body}
    </svg>
  );
}

/** Real artwork with a graceful fallback to a generated cover. */
export function Art({
  src,
  artKey,
  label,
  words = false,
}: {
  src?: string | null;
  artKey?: string;
  label?: string;
  words?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} />
    );
  }
  return <GenCover art={artKey ?? "generic"} label={label} words={words} />;
}
