/*
 * The example house. It runs whenever Dad's Sonos is not linked, so the app is
 * alive on first open: three rooms, his kind of favorites, grouping and scenes.
 * Same rules as the True North prototype: a room that joins a group remembers
 * what it was playing and gets it back when it leaves.
 */

import type { NowTrack, Zone, RoomRef, EqState } from "./types";

export interface DemoFav {
  id: string;
  name: string;
  kind: string;
  art: string;
  glow: string;
  live?: boolean;
  tracks: [string, string, string][];
}

export const DEMO_FAVS: DemoFav[] = [
  {
    id: "drive", name: "Classic Rock Drive", kind: "Spotify playlist", art: "sunset", glow: "232, 90, 110",
    tracks: [["Hotel California", "Eagles", "6:30"], ["Free Fallin’", "Tom Petty", "4:16"], ["Go Your Own Way", "Fleetwood Mac", "3:38"], ["Simple Man", "Lynyrd Skynyrd", "5:57"], ["Night Moves", "Bob Seger", "5:25"], ["More Than a Feeling", "Boston", "4:45"]],
  },
  {
    id: "country", name: "Patio Country", kind: "Spotify playlist", art: "vinyl", glow: "214, 129, 64",
    tracks: [["Chicken Fried", "Zac Brown Band", "3:58"], ["Chattahoochee", "Alan Jackson", "2:28"], ["Knee Deep", "Zac Brown Band", "3:23"], ["Amarillo by Morning", "George Strait", "2:52"], ["Tennessee Whiskey", "Chris Stapleton", "4:53"], ["Beautiful Crazy", "Luke Combs", "3:13"]],
  },
  {
    id: "garage", name: "Garage Rock", kind: "Spotify playlist", art: "caution", glow: "253, 212, 49",
    tracks: [["Thunderstruck", "AC/DC", "4:52"], ["Sharp Dressed Man", "ZZ Top", "4:15"], ["Panama", "Van Halen", "3:31"], ["Paradise City", "Guns N’ Roses", "6:46"], ["Back in Black", "AC/DC", "4:15"]],
  },
  {
    id: "beach", name: "Carolina Beach Music", kind: "Spotify playlist", art: "waves", glow: "34, 186, 178",
    tracks: [["I Love Beach Music", "The Embers", "3:10"], ["Carolina Girls", "Chairmen of the Board", "3:40"], ["Be Young, Be Foolish, Be Happy", "The Tams", "2:22"], ["Under the Boardwalk", "The Drifters", "2:43"], ["My Girl", "The Temptations", "2:45"]],
  },
  {
    id: "yacht", name: "Yacht Rock", kind: "Spotify playlist", art: "sail", glow: "63, 167, 201",
    tracks: [["What a Fool Believes", "The Doobie Brothers", "3:44"], ["Sailing", "Christopher Cross", "4:14"], ["Africa", "Toto", "4:55"], ["Peg", "Steely Dan", "3:57"], ["Summer Breeze", "Seals & Crofts", "3:26"]],
  },
  {
    id: "soul", name: "Sunday Morning Soul", kind: "Spotify playlist", art: "sunrise", glow: "240, 150, 110",
    tracks: [["Lovely Day", "Bill Withers", "4:15"], ["(Sittin’ On) The Dock of the Bay", "Otis Redding", "2:44"], ["Let’s Stay Together", "Al Green", "3:18"], ["A Change Is Gonna Come", "Sam Cooke", "3:11"]],
  },
  {
    id: "radio", name: "Classic Rock Radio", kind: "Sonos Radio", art: "radio", glow: "120, 140, 210", live: true,
    tracks: [["Classic Rock Radio", "Live on Sonos Radio", "0:00"]],
  },
];

export const DEMO_FAV: Record<string, DemoFav> = Object.fromEntries(DEMO_FAVS.map((f) => [f.id, f]));

export const DEMO_ROOMS = [
  { id: "living", name: "Living Room", speakers: ["Move", "Sub Mini"] },
  { id: "patio", name: "Patio", speakers: ["Move", "Move"] },
  { id: "garage", name: "Garage", speakers: ["Move", "Sub"] },
];
export const DEMO_ROOM: Record<string, (typeof DEMO_ROOMS)[number]> = Object.fromEntries(DEMO_ROOMS.map((r) => [r.id, r]));
export const DEMO_IDS = DEMO_ROOMS.map((r) => r.id);

const secs = (s: string) => {
  const p = s.split(":").map(Number);
  return p[0] * 60 + p[1];
};

export interface DemoSess {
  fav: string;
  i: number;
  t: number;
  on: boolean;
}
export interface DemoRoom {
  vol: number;
  leader: string | null;
  saved: DemoSess | null;
  sess: DemoSess;
}
export interface DemoState {
  rooms: Record<string, DemoRoom>;
  shuffle: boolean;
  repeat: boolean;
  eq: Record<string, EqState>;
}

const eq = (bass: number, treble: number, sub: number | null, night: boolean | null): EqState => ({
  bass,
  treble,
  loudness: true,
  subGain: sub,
  subEnabled: sub == null ? null : true,
  nightMode: night,
  dialogLevel: night == null ? null : false,
});

export function initialDemo(): DemoState {
  return {
    shuffle: false,
    repeat: false,
    rooms: {
      living: { vol: 32, leader: null, saved: null, sess: { fav: "drive", i: 0, t: 134, on: true } },
      patio: { vol: 48, leader: null, saved: null, sess: { fav: "country", i: 0, t: 62, on: true } },
      garage: { vol: 61, leader: null, saved: null, sess: { fav: "garage", i: 0, t: 219, on: true } },
    },
    eq: {
      living: eq(1, 0, 2, false),
      patio: eq(2, 1, null, null),
      garage: eq(3, 2, 4, null),
    },
  };
}

/* ---------- pure helpers over a DemoState ---------- */

const leaderOf = (S: DemoState, id: string) => S.rooms[id].leader || id;
export const demoMembers = (S: DemoState, lead: string) => DEMO_IDS.filter((id) => leaderOf(S, id) === lead);
const leaders = (S: DemoState) => DEMO_IDS.filter((id) => !S.rooms[id].leader);
const sessOf = (S: DemoState, id: string) => S.rooms[leaderOf(S, id)].sess;
export const demoLeaderOf = leaderOf;

function trackOf(s: DemoSess): NowTrack {
  const f = DEMO_FAV[s.fav];
  const t = f.tracks[s.i];
  return {
    title: t[0],
    artist: t[1],
    artKey: f.art,
    durationMs: f.live ? null : secs(t[2]) * 1000,
    live: !!f.live,
  };
}

export function demoZones(S: DemoState, now: number): Zone[] {
  return leaders(S).map((lead) => {
    const ids = demoMembers(S, lead);
    const s = S.rooms[lead].sess;
    const f = DEMO_FAV[s.fav];
    const grouped = ids.length > 1;
    const next = f.live
      ? []
      : [1, 2, 3, 4]
          .map((k) => (s.i + k) % f.tracks.length)
          .filter((v, i, a) => a.indexOf(v) === i && v !== s.i)
          .map((i) => ({ ...trackOf({ ...s, i }), index: i }));
    return {
      key: "demo:" + lead,
      kind: "demo",
      id: lead,
      name: ids.map((id) => DEMO_ROOM[id].name).join(" + "),
      sub: grouped ? ids.length + " rooms in sync" : DEMO_ROOM[lead].speakers.join(" · "),
      roomIds: ids,
      playing: s.on,
      track: trackOf(s),
      source: f.name + " · " + f.kind,
      positionMs: f.live ? null : s.t * 1000,
      positionAt: now,
      canSkip: !f.live,
      canSkipBack: !f.live,
      members: ids.map((id) => ({ roomId: id, name: DEMO_ROOM[id].name, volume: S.rooms[id].vol })),
      upNext: next,
      speakers: ids.flatMap((id) => DEMO_ROOM[id].speakers.map((sp) => ({ name: sp, room: DEMO_ROOM[id].name }))),
      glowSeed: f.glow,
    } satisfies Zone;
  });
}

export function demoRooms(S: DemoState): RoomRef[] {
  return DEMO_ROOMS.map((r) => {
    const s = sessOf(S, r.id);
    return {
      id: r.id,
      name: r.name,
      kind: "demo",
      zoneKey: "demo:" + leaderOf(S, r.id),
      status: s.on ? "Now: " + DEMO_FAV[s.fav].tracks[s.i][0] : "Paused",
    };
  });
}

/* ---------- mutations: each returns a fresh state ---------- */

const clone = (S: DemoState): DemoState => structuredClone(S);

function detach(S: DemoState, id: string) {
  const r = S.rooms[id];
  if (r.leader) {
    r.sess = { ...S.rooms[r.leader].sess };
    r.leader = null;
    return;
  }
  const rest = DEMO_IDS.filter((x) => S.rooms[x].leader === id);
  if (rest.length) {
    const nl = rest[0];
    S.rooms[nl].leader = null;
    S.rooms[nl].sess = { ...r.sess };
    rest.slice(1).forEach((x) => {
      S.rooms[x].leader = nl;
    });
  }
}

export function demoPlayOn(S0: DemoState, favId: string, idsIn: string[], start = 0): DemoState {
  const S = clone(S0);
  const ids = DEMO_IDS.filter((id) => idsIn.includes(id));
  if (!ids.length || !DEMO_FAV[favId]) return S0;
  ids.slice(1).forEach((id) => {
    if (!S.rooms[id].saved) S.rooms[id].saved = { ...sessOf(S, id) };
  });
  ids.forEach((id) => detach(S, id));
  const lead = ids[0];
  S.rooms[lead].saved = null;
  ids.slice(1).forEach((id) => {
    S.rooms[id].leader = lead;
  });
  S.rooms[lead].sess = { fav: favId, i: start, t: 0, on: true };
  return S;
}

function restore(S: DemoState, id: string, groupSess: DemoSess) {
  const r = S.rooms[id];
  r.leader = null;
  r.sess = r.saved ? { ...r.saved } : { ...groupSess, on: false };
  r.saved = null;
}

export function demoSplit(S0: DemoState, lead: string): DemoState {
  const S = clone(S0);
  const g = S.rooms[lead].sess;
  demoMembers(S, lead)
    .filter((id) => id !== lead)
    .forEach((id) => restore(S, id, g));
  return S;
}

/** Add a room to a group, or give it its own music back if it is already in it. */
export function demoToggleMember(S0: DemoState, lead: string, id: string): { state: DemoState; joined: boolean } {
  const S = clone(S0);
  const r = S.rooms[id];
  if (r.leader === lead) {
    restore(S, id, S.rooms[lead].sess);
    return { state: S, joined: false };
  }
  if (!r.saved) r.saved = { ...sessOf(S, id) };
  detach(S, id);
  r.leader = lead;
  return { state: S, joined: true };
}

export function demoLeave(S0: DemoState, id: string): DemoState {
  const S = clone(S0);
  const lead = leaderOf(S, id);
  if (lead === id) {
    // The leader leaves: the rest keep the music, this room goes quiet.
    const rest = demoMembers(S, lead).filter((x) => x !== id);
    if (!rest.length) return S0;
    detach(S, id);
    S.rooms[id].sess = { ...S.rooms[rest[0]].sess, on: false };
    return S;
  }
  restore(S, id, S.rooms[lead].sess);
  return S;
}

export function demoToggle(S0: DemoState, id: string, on?: boolean): DemoState {
  const S = clone(S0);
  const s = S.rooms[leaderOf(S, id)].sess;
  s.on = on ?? !s.on;
  return S;
}

export function demoStep(S0: DemoState, id: string, dir: number): DemoState | null {
  const S = clone(S0);
  const s = S.rooms[leaderOf(S, id)].sess;
  const f = DEMO_FAV[s.fav];
  if (f.live) return null;
  s.i = (s.i + dir + f.tracks.length) % f.tracks.length;
  s.t = 0;
  s.on = true;
  return S;
}

export function demoJump(S0: DemoState, id: string, i: number): DemoState {
  const S = clone(S0);
  const s = S.rooms[leaderOf(S, id)].sess;
  s.i = i;
  s.t = 0;
  s.on = true;
  return S;
}

export function demoAllOff(S0: DemoState): DemoState {
  const S = clone(S0);
  leaders(S).forEach((id) => {
    S.rooms[id].sess.on = false;
  });
  return S;
}

export function demoSetVol(S0: DemoState, id: string, v: number): DemoState {
  if (!S0.rooms[id]) return S0;
  const S = clone(S0);
  S.rooms[id].vol = Math.round(v);
  return S;
}

export function demoTick(S0: DemoState): DemoState | null {
  let changed = false;
  const S = clone(S0);
  leaders(S).forEach((id) => {
    const s = S.rooms[id].sess;
    const f = DEMO_FAV[s.fav];
    if (!s.on || f.live) return;
    changed = true;
    s.t += 1;
    if (s.t >= secs(f.tracks[s.i][2])) {
      s.i = S.shuffle ? Math.floor(Math.random() * f.tracks.length) : (s.i + 1) % f.tracks.length;
      s.t = 0;
    }
  });
  return changed ? S : null;
}

export function demoSetEq(S0: DemoState, id: string, patch: Partial<EqState>): DemoState {
  const S = clone(S0);
  S.eq[id] = { ...S.eq[id], ...patch };
  return S;
}

/** Demo scenes, the same four the prototype had. */
export const DEMO_SCENES: { id: string; name: string; icon: string; note: string; run: (S: DemoState) => { state: DemoState; msg: string } }[] = [
  {
    id: "cookout", name: "Cookout", icon: "flame", note: "Patio + Living Room",
    run(S) {
      const n = demoPlayOn(S, "beach", ["patio", "living"]);
      n.rooms.patio.vol = 55;
      n.rooms.living.vol = 34;
      return { state: n, msg: "Cookout is on. Carolina Beach Music on the Patio and in the Living Room." };
    },
  },
  {
    id: "shop", name: "Shop Time", icon: "wrench", note: "Garage, turned up",
    run(S) {
      const n = demoPlayOn(S, "garage", ["garage"]);
      n.rooms.garage.vol = 72;
      return { state: n, msg: "Shop Time. Garage Rock is turned up in the Garage." };
    },
  },
  {
    id: "wind", name: "Wind Down", icon: "moon", note: "Living Room, low",
    run(S) {
      const n = demoPlayOn(S, "soul", ["living"]);
      n.rooms.living.vol = 22;
      leaders(n).forEach((id) => {
        if (id !== "living") n.rooms[id].sess.on = false;
      });
      return { state: n, msg: "Wind Down. Soul on low in the Living Room, the rest paused." };
    },
  },
  {
    id: "house", name: "Whole House", icon: "house", note: "Every room together",
    run(S) {
      const n = demoPlayOn(S, "drive", DEMO_IDS.slice());
      DEMO_IDS.forEach((id) => {
        n.rooms[id].vol = 40;
      });
      return { state: n, msg: "Whole House. Every room is playing Classic Rock Drive." };
    },
  },
];
