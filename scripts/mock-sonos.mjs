#!/usr/bin/env node
/*
 * A stand-in for the Sonos cloud Control API, for testing the real-house
 * screens without real speakers. Dev only: point SONOS_API_BASE at it in
 * .env.local (http://127.0.0.1:5099) and use a test cookie. Never set in prod.
 *
 *   node scripts/mock-sonos.mjs [--port 5099]
 */

import http from "node:http";

const port = Number(process.argv[process.argv.indexOf("--port") + 1]) || 5099;
const HH = "Sonos_MockHouse.1";

const players = [
  { id: "RINCON_MOCK000000000101400", name: "Living Room", icon: "livingroom", deviceIds: ["RINCON_MOCK000000000101400", "RINCON_MOCK000000000201400"], capabilities: ["PLAYBACK", "CLOUD", "HT_PLAYBACK", "AUDIO_CLIP"] },
  { id: "RINCON_MOCK000000000301400", name: "Patio", icon: "patio", deviceIds: ["RINCON_MOCK000000000301400", "RINCON_MOCK000000000401400"], capabilities: ["PLAYBACK", "CLOUD", "AUDIO_CLIP"] },
  { id: "RINCON_MOCK000000000501400", name: "Garage", icon: "garage", deviceIds: ["RINCON_MOCK000000000501400"], capabilities: ["PLAYBACK", "CLOUD", "LINE_IN"] },
];

const art = (seed) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/300`;
const favorites = [
  { id: "1", name: "Classic Rock Drive", description: "Spotify playlist", service: { name: "Spotify", id: "12" }, tracks: [["Hotel California", "Eagles", 390000], ["Free Fallin'", "Tom Petty", 256000], ["Go Your Own Way", "Fleetwood Mac", 218000]] },
  { id: "2", name: "Patio Country", description: "Spotify playlist", service: { name: "Spotify", id: "12" }, tracks: [["Chicken Fried", "Zac Brown Band", 238000], ["Chattahoochee", "Alan Jackson", 148000]] },
  { id: "3", name: "Garage Rock", description: "Spotify playlist", service: { name: "Spotify", id: "12" }, tracks: [["Thunderstruck", "AC/DC", 292000], ["Sharp Dressed Man", "ZZ Top", 255000]] },
  { id: "4", name: "Carolina Beach Music", description: "Spotify playlist", service: { name: "Spotify", id: "12" }, tracks: [["I Love Beach Music", "The Embers", 190000], ["Carolina Girls", "Chairmen of the Board", 220000]] },
  { id: "5", name: "Classic Rock Radio", description: "Sonos Radio", service: { name: "Sonos Radio", id: "303" }, live: true, tracks: [["Classic Rock Radio", "", 0]] },
  { id: "6", name: "Compass Classics · Patio", description: "Spotify playlist", service: { name: "Spotify", id: "12" }, tracks: [["Hotel California", "Eagles", 390000]] },
].map((f) => ({ ...f, imageUrl: art(f.name) }));

let gid = 100;
const newGroupId = (coord) => coord + ":" + ++gid;

/** Each group: members, coordinator, what is playing. */
let groups = players.map((p, i) => ({
  id: newGroupId(p.id),
  coordinatorId: p.id,
  playerIds: [p.id],
  sess: { fav: String(i + 1), i: 0, pos: 30000 * (i + 1), at: Date.now(), playing: i !== 2, shuffle: false },
}));
const vol = Object.fromEntries(players.map((p, i) => [p.id, { volume: [32, 48, 61][i], muted: false, fixed: false }]));

const favOf = (s) => favorites.find((f) => f.id === s.fav) ?? favorites[0];
function position(s) {
  const f = favOf(s);
  let pos = s.pos + (s.playing ? Date.now() - s.at : 0);
  const dur = f.tracks[s.i][2];
  while (dur && pos >= dur) {
    pos -= dur;
    s.i = (s.i + 1) % f.tracks.length;
  }
  s.pos = pos;
  s.at = Date.now();
  return pos;
}
const groupName = (g) => g.playerIds.map((id) => players.find((p) => p.id === id).name)[0] + (g.playerIds.length > 1 ? " + " + (g.playerIds.length - 1) : "");

function publicGroup(g) {
  return {
    id: g.id,
    name: groupName(g),
    coordinatorId: g.coordinatorId,
    playbackState: g.sess.playing ? "PLAYBACK_STATE_PLAYING" : "PLAYBACK_STATE_PAUSED",
    playerIds: g.playerIds,
  };
}

function removeFromGroups(ids) {
  for (const g of groups) {
    const before = g.playerIds.length;
    g.playerIds = g.playerIds.filter((p) => !ids.includes(p));
    if (g.playerIds.length !== before && g.playerIds.length) {
      if (!g.playerIds.includes(g.coordinatorId)) g.coordinatorId = g.playerIds[0];
      g.id = newGroupId(g.coordinatorId);
    }
  }
  groups = groups.filter((g) => g.playerIds.length);
}

function track(f, i) {
  const t = f.tracks[i];
  if (f.live) return undefined;
  return { type: "track", name: t[0], artist: { name: t[1] }, album: { name: f.name }, imageUrl: art(t[0]), durationMillis: t[2], service: f.service };
}

const routes = [
  ["GET", /^\/households$/, () => ({ households: [{ id: HH, name: "Mock House" }] })],
  ["GET", /^\/households\/[^/]+\/groups$/, () => ({ groups: groups.map(publicGroup), players })],
  ["GET", /^\/groups\/([^/]+)\/playback$/, (m) => {
    const g = find(m[1]);
    const f = favOf(g.sess);
    return {
      playbackState: g.sess.playing ? "PLAYBACK_STATE_PLAYING" : "PLAYBACK_STATE_PAUSED",
      positionMillis: f.live ? 0 : position(g.sess),
      playModes: { shuffle: g.sess.shuffle, repeat: false, repeatOne: false, crossfade: false },
      availablePlaybackActions: { canSkip: !f.live, canSkipBack: !f.live, canSeek: !f.live, canPause: !f.live, canShuffle: !f.live },
    };
  }],
  ["GET", /^\/groups\/([^/]+)\/playbackMetadata$/, (m) => {
    const g = find(m[1]);
    const f = favOf(g.sess);
    position(g.sess);
    return {
      container: { name: f.name, type: f.live ? "station" : "playlist", service: f.service, imageUrl: f.imageUrl },
      currentItem: f.live ? undefined : { track: track(f, g.sess.i) },
      nextItem: f.live ? undefined : { track: track(f, (g.sess.i + 1) % f.tracks.length) },
      streamInfo: f.live ? "Boston · More Than a Feeling" : undefined,
    };
  }],
  ["GET", /^\/groups\/([^/]+)\/groupVolume$/, (m) => {
    const g = find(m[1]);
    const v = Math.round(g.playerIds.reduce((n, p) => n + vol[p].volume, 0) / g.playerIds.length);
    return { volume: v, muted: false, fixed: false };
  }],
  ["GET", /^\/players\/([^/]+)\/playerVolume$/, (m) => vol[m[1]] ?? err(404, "ERROR_RESOURCE_GONE")],
  ["POST", /^\/players\/([^/]+)\/playerVolume$/, (m, b) => {
    vol[m[1]].volume = Math.max(0, Math.min(100, b.volume ?? vol[m[1]].volume));
    return {};
  }],
  ["POST", /^\/groups\/([^/]+)\/groupVolume$/, (m, b) => {
    for (const p of find(m[1]).playerIds) vol[p].volume = b.volume;
    return {};
  }],
  ["POST", /^\/groups\/([^/]+)\/playback\/(play|pause|togglePlayPause|skipToNextTrack|skipToPreviousTrack)$/, (m) => {
    const g = find(m[1]);
    position(g.sess);
    const f = favOf(g.sess);
    if (m[2] === "play") g.sess.playing = true;
    if (m[2] === "pause") g.sess.playing = false;
    if (m[2] === "togglePlayPause") g.sess.playing = !g.sess.playing;
    if (m[2] === "skipToNextTrack") {
      if (f.live) return err(400, "ERROR_DISALLOWED_BY_POLICY");
      g.sess.i = (g.sess.i + 1) % f.tracks.length;
      g.sess.pos = 0;
    }
    if (m[2] === "skipToPreviousTrack") {
      if (f.live) return err(400, "ERROR_DISALLOWED_BY_POLICY");
      g.sess.i = (g.sess.i - 1 + f.tracks.length) % f.tracks.length;
      g.sess.pos = 0;
    }
    return {};
  }],
  ["POST", /^\/groups\/([^/]+)\/playback\/playMode$/, (m, b) => {
    const g = find(m[1]);
    if (typeof b.playModes?.shuffle === "boolean") g.sess.shuffle = b.playModes.shuffle;
    return {};
  }],
  ["POST", /^\/households\/[^/]+\/groups\/createGroup$/, (m, b) => {
    const ids = b.playerIds ?? [];
    const src = b.musicContextGroupId ? groups.find((g) => g.id === b.musicContextGroupId) : null;
    const sess = src ? { ...src.sess } : { fav: "1", i: 0, pos: 0, at: Date.now(), playing: false, shuffle: false };
    removeFromGroups(ids);
    const g = { id: newGroupId(ids[0]), coordinatorId: ids[0], playerIds: [...ids], sess };
    groups.push(g);
    return { group: publicGroup(g) };
  }],
  ["POST", /^\/groups\/([^/]+)\/groups\/modifyGroupMembers$/, (m, b) => {
    const g = find(m[1]);
    const add = b.playerIdsToAdd ?? [];
    const rem = b.playerIdsToRemove ?? [];
    removeFromGroups(add);
    for (const p of rem) {
      g.playerIds = g.playerIds.filter((x) => x !== p);
      groups.push({ id: newGroupId(p), coordinatorId: p, playerIds: [p], sess: { ...g.sess, playing: false } });
    }
    g.playerIds = [...new Set([...g.playerIds, ...add])];
    if (!g.playerIds.includes(g.coordinatorId)) g.coordinatorId = g.playerIds[0];
    g.id = newGroupId(g.coordinatorId);
    if (!groups.includes(g)) groups.push(g);
    groups = groups.filter((x) => x.playerIds.length);
    return { group: publicGroup(g) };
  }],
  ["GET", /^\/households\/[^/]+\/favorites$/, () => ({ version: "1", items: favorites.map(({ tracks, live, ...f }) => f) })],
  ["GET", /^\/households\/[^/]+\/playlists$/, () => ({ version: "1", playlists: [{ id: "SQ:1", name: "Dad's Mix", type: "playlist", trackCount: 42 }] })],
  ["POST", /^\/groups\/([^/]+)\/favorites$/, (m, b) => {
    const g = find(m[1]);
    if (!favorites.some((f) => f.id === b.favoriteId)) return err(404, "ERROR_INVALID_OBJECT_ID");
    g.sess = { ...g.sess, fav: b.favoriteId, i: 0, pos: 0, at: Date.now(), playing: b.playOnCompletion !== false };
    return {};
  }],
  ["POST", /^\/groups\/([^/]+)\/playlists$/, (m) => {
    const g = find(m[1]);
    g.sess = { ...g.sess, fav: "1", i: 0, pos: 0, at: Date.now(), playing: true };
    return {};
  }],
];

class ApiErr extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
function err(status, code) {
  throw new ApiErr(status, code);
}
function find(id) {
  const g = groups.find((x) => x.id === decodeURIComponent(id));
  if (!g) err(410, "ERROR_RESOURCE_GONE");
  return g;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const path = url.pathname.replace(/^\/control\/api\/v1/, "");
    let body = "";
    for await (const ch of req) body += ch;
    let b = {};
    try {
      b = body ? JSON.parse(body) : {};
    } catch {
      b = {};
    }
    if (!/^Bearer mock-/.test(req.headers.authorization ?? "")) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ errorCode: "ERROR_NOT_AUTHORIZED" }));
    }
    for (const [method, re, fn] of routes) {
      const m = path.match(re);
      if (!m || method !== req.method) continue;
      try {
        const out = fn(m, b);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(out ?? {}));
      } catch (e) {
        if (e instanceof ApiErr) {
          res.writeHead(e.status, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ errorCode: e.code }));
        }
        res.writeHead(500);
        return res.end(String(e));
      }
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ errorCode: "ERROR_NOT_FOUND", path }));
  })
  .listen(port, "127.0.0.1", () => console.log("mock Sonos API on http://127.0.0.1:" + port));
