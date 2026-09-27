/*
 * Scenes for the real house. Each one names its rooms, their volumes, and
 * optionally the music. With no music set, a scene keeps whatever is already
 * playing and just pulls the rooms together at the right volume.
 */

import type { PlayItem } from "./types";
import { norm, store } from "./util";

export interface Scene {
  id: string;
  name: string;
  icon: string;
  note: string;
  /** Room names, or ["*"] for every room. */
  rooms: string[];
  /** Volume per room name ("*" applies to every room in the scene). */
  volumes: Record<string, number>;
  music: PlayItem | null;
  pauseOthers?: boolean;
}

const KEY = "cc.scenes";

/** Pick the room that best matches a word like "patio" from the real room names. */
export function pickRoom(names: string[], ...words: string[]): string | null {
  for (const w of words) {
    const hit = names.find((n) => norm(n).includes(w));
    if (hit) return hit;
  }
  return null;
}

export function defaultScenes(roomNames: string[]): Scene[] {
  const living = pickRoom(roomNames, "living", "family", "den", "kitchen") ?? roomNames[0] ?? null;
  const patio = pickRoom(roomNames, "patio", "deck", "porch", "back", "pool", "yard") ?? roomNames[1] ?? null;
  const garage = pickRoom(roomNames, "garage", "shop") ?? roomNames[2] ?? roomNames[0] ?? null;
  const two = [patio, living].filter((x): x is string => !!x && x !== null);
  return [
    {
      id: "cookout",
      name: "Cookout",
      icon: "flame",
      note: two.length > 1 ? two.join(" + ") : two[0] ?? "Outside",
      rooms: [...new Set(two)],
      volumes: Object.fromEntries(two.map((r, i) => [r, i === 0 ? 55 : 34])),
      music: null,
    },
    {
      id: "shop",
      name: "Shop Time",
      icon: "wrench",
      note: (garage ?? "Garage") + ", turned up",
      rooms: garage ? [garage] : [],
      volumes: garage ? { [garage]: 72 } : {},
      music: null,
    },
    {
      id: "wind",
      name: "Wind Down",
      icon: "moon",
      note: (living ?? "Living Room") + ", low",
      rooms: living ? [living] : [],
      volumes: living ? { [living]: 22 } : {},
      music: null,
      pauseOthers: true,
    },
    {
      id: "house",
      name: "Whole House",
      icon: "house",
      note: "Every room together",
      rooms: ["*"],
      volumes: { "*": 40 },
      music: null,
    },
  ];
}

export function loadScenes(roomNames: string[]): Scene[] {
  const saved = store.get<Scene[] | null>(KEY, null);
  if (!saved || !saved.length) return defaultScenes(roomNames);
  return saved;
}

export function saveScenes(list: Scene[] | null) {
  if (list) store.set(KEY, list);
  else store.del(KEY);
}
