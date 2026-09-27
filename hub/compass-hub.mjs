#!/usr/bin/env node
// Compass Classics home hub
// -------------------------
// A tiny local bridge between the Compass Classics web app and the Sonos speakers
// in the house. The Sonos cloud API can't change EQ and can't start an arbitrary
// Spotify song, but every Sonos player also speaks UPnP/SOAP on port 1400 on the
// home network, and that interface can do both. This one file is the whole hub:
// zero npm dependencies, Node 18 or newer.
//
//   node compass-hub.mjs              start on http://127.0.0.1:5005
//   node compass-hub.mjs --mock       fake house, no speakers needed
//   node compass-hub.mjs --help       every option

import dgram from 'node:dgram';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// ============================================================================
// Constants and command line
// ============================================================================

const VERSION = '1.0.0';
const SONOS_PORT = 1400;
const SOAP_TIMEOUT_MS = 5000;
const DESCRIBE_TIMEOUT_MS = 3000;
const SSDP_LISTEN_MS = 3000;
const RESCAN_EVERY_MS = 5 * 60 * 1000;
const RATE_LIMIT_PER_MIN = 240; // per client IP; generous enough for slider drags
const MAX_BODY_BYTES = 16 * 1024;
const CONFIG_PATH = process.env.COMPASS_HUB_CONFIG || path.join(os.homedir(), '.compass-hub.json');

const DEFAULT_ORIGINS = [
  'https://compassclassics.com',
  'https://www.compassclassics.com',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
];
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/compassclassics[a-z0-9-]*\.vercel\.app$/;

const HELP = `Compass Classics home hub v${VERSION}

Usage: node compass-hub.mjs [options]

  --port <n>          Port to listen on (default 5005)
  --host <addr>       Address to listen on (default 127.0.0.1 = this computer only)
  --lan               Listen on 0.0.0.0 so other devices on the home network can connect
  --mock              Simulate a house with three Sonos rooms (no speakers needed)
  --ip <addr>         Check this Sonos speaker IP directly. Repeat for more speakers.
                      Use it when discovery finds nothing (firewall or multicast blocked).
  --key <key>         Use this key for this run instead of the saved one
  --spotify-sn <n>    Spotify account number inside Sonos (skips auto-detection)
  --spotify-sid <n>   Spotify service id inside Sonos: 12 (current) or 9 (older systems)
  --origin <url>      Another website allowed to call the hub. Repeat for more.
  --tunnel            Also start a Cloudflare quick tunnel (needs cloudflared installed)
  -h, --help          Show this help

Settings are saved in ${CONFIG_PATH}`;

function fail(message) {
  console.error(`Error: ${message}\nRun with --help to see every option.`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    port: 5005, host: '127.0.0.1', mock: false, ips: [], key: null,
    spotifySn: null, spotifySid: null, origins: [], tunnel: false, help: false,
  };
  const toInt = (value, flag, min, max) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) fail(`${flag} needs a whole number from ${min} to ${max}`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    const flag = arg.startsWith('--') && eq > 0 ? arg.slice(0, eq) : arg;
    const inline = arg.startsWith('--') && eq > 0 ? arg.slice(eq + 1) : undefined;
    const value = () => {
      const v = inline ?? argv[++i];
      if (v === undefined || (inline === undefined && v.startsWith('--'))) fail(`${flag} needs a value`);
      return v;
    };
    switch (flag) {
      case '--port': opts.port = toInt(value(), flag, 1, 65535); break;
      case '--host': opts.host = value(); break;
      case '--lan': opts.host = '0.0.0.0'; break;
      case '--mock': opts.mock = true; break;
      case '--ip': opts.ips.push(...value().split(',').map((s) => s.trim()).filter(Boolean)); break;
      case '--key': opts.key = value(); break;
      case '--spotify-sn': opts.spotifySn = toInt(value(), flag, 0, 1000); break;
      case '--spotify-sid': opts.spotifySid = toInt(value(), flag, 1, 100000); break;
      case '--origin': opts.origins.push(value().trim().replace(/\/+$/, '').toLowerCase()); break;
      case '--tunnel': opts.tunnel = true; break;
      case '-h': case '--help': opts.help = true; break;
      default: fail(`Unknown option "${arg}"`);
    }
  }
  if (opts.key !== null && !/^[\x21-\x7e]{8,200}$/.test(opts.key)) {
    fail('--key must be at least 8 characters with no spaces');
  }
  for (const ip of opts.ips) {
    if (!/^[A-Za-z0-9.-]+$/.test(ip)) fail(`--ip "${ip}" doesn't look like an IP address`);
  }
  for (const origin of opts.origins) {
    if (!/^https?:\/\/[^/\s]+$/.test(origin)) fail(`--origin "${origin}" should look like https://example.com`);
  }
  return opts;
}

// ============================================================================
// Saved settings (~/.compass-hub.json)
// ============================================================================

function loadConfig() {
  let raw;
  try { raw = fs.readFileSync(CONFIG_PATH, 'utf8'); } catch { return {}; } // first run
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch { /* fall through */ }
  // Keep a copy of an unreadable file instead of silently throwing it away.
  const backup = `${CONFIG_PATH}.bak`;
  try { fs.copyFileSync(CONFIG_PATH, backup); } catch { /* ignore */ }
  console.warn(`! ${CONFIG_PATH} was not valid JSON. Saved a copy as ${backup} and starting fresh.`);
  return {};
}

// Returns { key, source } where source is "flag", "saved" or "new".
function resolveKey(flagKey) {
  if (flagKey) return { key: flagKey, source: 'flag' };
  const config = loadConfig();
  if (typeof config.key === 'string' && /^[A-Za-z0-9_-]{16,}$/.test(config.key)) {
    return { key: config.key, source: 'saved' };
  }
  const key = crypto.randomBytes(18).toString('base64url'); // 18 random bytes = 24 URL-safe chars
  try {
    fs.writeFileSync(CONFIG_PATH, `${JSON.stringify({ ...config, key }, null, 2)}\n`, { mode: 0o600 });
  } catch (err) {
    console.warn(`! Could not save the key to ${CONFIG_PATH} (${err.message}). It will change next start.`);
  }
  return { key, source: 'new' };
}

// ============================================================================
// Small helpers: logging, errors, XML
// ============================================================================

const log = (...args) => console.log(`[${new Date().toLocaleTimeString('en-GB')}]`, ...args);

// An error that maps straight onto an HTTP status for the API.
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// A failed call to a Sonos player. fault = the player answered with a SOAP fault
// (it understood us and said no); timeout = it never answered.
class UpnpError extends Error {
  constructor(message, { code = null, fault = false, timeout = false } = {}) {
    super(message);
    Object.assign(this, { code, fault, timeout });
  }
}

const toInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
};

const xmlEscape = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Single pass, so "&amp;lt;" correctly becomes "&lt;" and not "<".
function xmlUnescape(value) {
  return String(value ?? '').replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (match, entity) => {
    const e = entity.toLowerCase();
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    if (e === 'amp') return '&';
    const code = e[1] === 'x' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
    try { return String.fromCodePoint(code); } catch { return match; }
  });
}

// Text inside the first <name> element (any namespace prefix), unescaped; null if absent.
function tagText(xml, name) {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${name}(?:\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>)`, 'i');
  const m = re.exec(xml);
  return m ? xmlUnescape(m[1] ?? '') : null;
}

function parseAttrs(text) {
  const attrs = {};
  for (const m of String(text).matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[m[1]] = xmlUnescape(m[2] ?? m[3] ?? '');
  }
  return attrs;
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

// ============================================================================
// Sonos UPnP: SOAP client
// ============================================================================

const CONTROL_URLS = {
  RenderingControl: '/MediaRenderer/RenderingControl/Control',
  AVTransport: '/MediaRenderer/AVTransport/Control',
  ZoneGroupTopology: '/ZoneGroupTopology/Control',
  ContentDirectory: '/MediaServer/ContentDirectory/Control',
};

// Call one UPnP action on a player and return the raw response XML.
// Sonos cares about argument ORDER (it must match the service description), so
// callers pass args in the documented order; object key order is preserved.
async function soap(ip, service, action, args = {}) {
  const ns = `urn:schemas-upnp-org:service:${service}:1`;
  const argXml = Object.entries(args).map(([k, v]) => `<${k}>${xmlEscape(v)}</${k}>`).join('');
  const body = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
    + 's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>'
    + `<u:${action} xmlns:u="${ns}">${argXml}</u:${action}></s:Body></s:Envelope>`;
  const where = `${service}.${action} on ${ip}`;
  let status;
  let text;
  try {
    const res = await fetch(`http://${ip}:${SONOS_PORT}${CONTROL_URLS[service]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: `"${ns}#${action}"` },
      body,
      signal: AbortSignal.timeout(SOAP_TIMEOUT_MS),
    });
    status = res.status;
    text = await res.text();
  } catch (err) {
    const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new UpnpError(
      `${where} ${timeout ? 'timed out' : `failed (${err?.cause?.code || err?.message || err})`}`,
      { timeout });
  }
  // A refused action comes back as HTTP 500 with <s:Fault> ... <UPnPError><errorCode>.
  if (status >= 400 || /<(?:[\w-]+:)?Fault\b/.test(text)) {
    const code = toInt(tagText(text, 'errorCode'));
    throw new UpnpError(
      `${where} was refused by the speaker (${code !== null ? `UPnP error ${code}` : `HTTP ${status}`})`,
      { code, fault: true });
  }
  return text;
}

// ============================================================================
// Sonos UPnP: discovery (SSDP, device descriptions, zone topology)
// ============================================================================

// Send an SSDP M-SEARCH for Sonos ZonePlayers and collect the IPs that answer.
// Players reply by unicast UDP to our socket, so a firewall that blocks inbound
// UDP for Node makes this quietly find nothing (that's what --ip is for).
function ssdpSearch(listenMs = SSDP_LISTEN_MS) {
  return new Promise((resolve) => {
    const found = new Set();
    const message = Buffer.from([
      'M-SEARCH * HTTP/1.1',
      'HOST: 239.255.255.250:1900',
      'MAN: "ssdp:discover"',
      'MX: 1',
      'ST: urn:schemas-upnp-org:device:ZonePlayer:1',
      '', '',
    ].join('\r\n'));
    let socket;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try { socket?.close(); } catch { /* already closed */ }
      resolve([...found]);
    };
    try {
      socket = dgram.createSocket('udp4');
    } catch (err) {
      log(`SSDP unavailable: ${err.message}`);
      resolve([]);
      return;
    }
    socket.on('error', (err) => { log(`SSDP error: ${err.message}`); finish(); });
    socket.on('message', (buf) => {
      const text = buf.toString('utf8');
      const location = /^location:\s*(\S+)/im.exec(text)?.[1];
      if (!location || !/sonos|rincon|zoneplayer/i.test(text)) return; // some other UPnP device
      const host = hostOf(location);
      if (host) found.add(host);
    });
    socket.bind(0, async () => {
      // A PC often has several adapters (Wi-Fi, Ethernet, VPN, WSL). Multicast only
      // leaves through one of them unless we pick each adapter in turn.
      const ifaces = Object.values(os.networkInterfaces()).flat()
        .filter((i) => i && (i.family === 'IPv4' || i.family === 4) && !i.internal)
        .map((i) => i.address);
      const sendVia = (iface) => new Promise((done) => {
        try { if (iface) socket.setMulticastInterface(iface); } catch { /* default route */ }
        socket.send(message, 1900, '239.255.255.250', () => done());
      });
      setTimeout(finish, listenMs);
      for (let round = 0; round < 3 && !finished; round++) {
        for (const iface of ifaces.length ? ifaces : [null]) {
          if (finished) break;
          try { await sendVia(iface); } catch { /* try the next adapter */ }
        }
        await new Promise((r) => setTimeout(r, 600));
      }
    });
  });
}

// A player's device description gives its room name, model and RINCON id.
async function describePlayer(ip) {
  try {
    const res = await fetch(`http://${ip}:${SONOS_PORT}/xml/device_description.xml`, {
      signal: AbortSignal.timeout(DESCRIBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    // Only the root <device>: the embedded MediaServer/MediaRenderer repeat some tags.
    const xml = (await res.text()).split(/<deviceList>/i)[0];
    const udn = tagText(xml, 'UDN');
    if (!udn || !/RINCON_/i.test(udn)) return null; // answered, but it isn't a Sonos player
    return {
      id: udn.replace(/^uuid:/i, ''),
      ip,
      roomName: tagText(xml, 'roomName') || '',
      displayName: tagText(xml, 'displayName') || '',
      modelName: tagText(xml, 'modelName') || '',
    };
  } catch {
    return null;
  }
}

const modelText = (d) => `${d?.displayName || ''} ${d?.modelName || ''}`;
const modelLabel = (d) => d?.displayName || (d?.modelName || '').replace(/^Sonos\s+/i, '');
const isSubModel = (d) => /\bsub\b/i.test(modelText(d));
const isSoundbarModel = (d) => /\b(arc|beam|ray|playbar|playbase)\b/i.test(modelText(d))
  || (/\bamp\b/i.test(modelText(d)) && !/connect/i.test(modelText(d)));

// GetZoneGroupState returns the household layout as an XML document escaped inside
// the SOAP response. Newer firmware wraps it in <ZoneGroupState><ZoneGroups>, older
// firmware starts at <ZoneGroups>; the regexes below handle both.
function parseZoneGroups(soapXml) {
  const inner = tagText(soapXml, 'ZoneGroupState') ?? '';
  const groups = [];
  for (const g of inner.matchAll(/<ZoneGroup\b([^>]*)>([\s\S]*?)<\/ZoneGroup>/g)) {
    const attrs = parseAttrs(g[1]);
    const members = [];
    const memberRe = /<ZoneGroupMember\b([^>]*?)(?:\/>|>([\s\S]*?)<\/ZoneGroupMember>)/g;
    for (const m of g[2].matchAll(memberRe)) {
      members.push({
        ...parseAttrs(m[1]),
        // Home theater subs and surrounds appear as <Satellite> children of the soundbar.
        satellites: [...(m[2] || '').matchAll(/<Satellite\b([^>]*?)\/?>/g)].map((s) => parseAttrs(s[1])),
      });
    }
    if (attrs.Coordinator) {
      groups.push({ id: attrs.ID || attrs.Coordinator, coordinator: attrs.Coordinator, members });
    }
  }
  return groups;
}

// Zone groups -> the rooms the app shows. Bonded extras (subs, surrounds, the second
// speaker of a stereo pair) are Invisible="1" members or nested Satellites; they are
// folded into their room rather than listed. Boost/Bridge units are skipped.
function buildRooms(groups, describedById) {
  const rooms = [];
  for (const group of groups) {
    const visible = group.members.filter((m) => m.Invisible !== '1' && m.IsZoneBridge !== '1');
    const memberIds = visible.map((m) => m.UUID);
    for (const m of visible) {
      const desc = describedById.get(m.UUID);
      const bonded = [
        ...m.satellites,
        ...group.members
          .filter((x) => x !== m && x.Invisible === '1' && x.ZoneName === m.ZoneName)
          .flatMap((x) => [x, ...x.satellites]),
      ];
      // Channel maps look like "RINCON_A:LF,RF;RINCON_B:SW"; ":SW" marks a bonded Sub.
      const channelMaps = `${m.HTSatChanMapSet || ''};${m.ChannelMapSet || ''}`.toUpperCase();
      rooms.push({
        id: m.UUID,
        name: m.ZoneName || desc?.roomName || m.UUID,
        model: modelLabel(desc),
        ip: hostOf(m.Location) || desc?.ip || null,
        coordinatorId: group.coordinator,
        isCoordinator: m.UUID === group.coordinator,
        memberIds,
        hasSub: channelMaps.includes(':SW') || bonded.some((b) => isSubModel(describedById.get(b.UUID))),
        isHomeTheater: Boolean(m.HTSatChanMapSet) || isSoundbarModel(desc),
      });
    }
  }
  return rooms;
}

// Fallback when no player would share the topology: one room per room name.
function roomsFromDescriptions(described) {
  const byName = new Map();
  for (const d of described) byName.set(d.roomName, [...(byName.get(d.roomName) || []), d]);
  return [...byName.values()].map((list) => {
    const main = list.find(isSoundbarModel) || list.find((d) => !isSubModel(d)) || list[0];
    return {
      id: main.id, name: main.roomName || main.id, model: modelLabel(main), ip: main.ip,
      coordinatorId: main.id, isCoordinator: true, memberIds: [main.id],
      hasSub: list.some((d) => d !== main && isSubModel(d)), isHomeTheater: isSoundbarModel(main),
    };
  });
}

// Find every player and work out the rooms. Never throws.
// Returns { rooms, players: Map(id -> ip) covering every device, visible or not }.
async function discoverSonos(seedIps, knownIps) {
  const ssdpIps = await ssdpSearch();
  const candidates = [...new Set([...seedIps, ...ssdpIps, ...knownIps])];
  const described = (await Promise.all(candidates.map(describePlayer))).filter(Boolean);
  const describedById = new Map(described.map((d) => [d.id, d]));

  // Ask for the topology until every player we found is covered. Two separate Sonos
  // systems on one network (say S1 and S2) each have to be asked separately.
  const groupsById = new Map();
  const covered = new Set();
  for (const d of described) {
    if (covered.has(d.id)) continue;
    try {
      for (const g of parseZoneGroups(await soap(d.ip, 'ZoneGroupTopology', 'GetZoneGroupState'))) {
        groupsById.set(g.id, g);
        for (const m of g.members) [m, ...m.satellites].forEach((x) => covered.add(x.UUID));
      }
    } catch (err) {
      log(`Topology from ${d.ip} failed: ${err.message}`);
    }
  }
  const groups = [...groupsById.values()];

  // The topology also lists players SSDP missed; describe those too, for model names.
  const everyone = groups.flatMap((g) => g.members.flatMap((m) => [m, ...m.satellites]));
  const missing = new Map(everyone
    .filter((m) => !describedById.has(m.UUID) && hostOf(m.Location))
    .map((m) => [m.UUID, hostOf(m.Location)]));
  for (const d of await Promise.all([...missing.values()].map(describePlayer))) {
    if (d) describedById.set(d.id, d);
  }

  const rooms = [
    ...buildRooms(groups, describedById),
    ...roomsFromDescriptions(described.filter((d) => !covered.has(d.id))),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const players = new Map();
  for (const d of describedById.values()) players.set(d.id, d.ip);
  for (const m of everyone) if (hostOf(m.Location)) players.set(m.UUID, hostOf(m.Location));
  return { rooms, players };
}

// ============================================================================
// Sonos UPnP: EQ and volume (RenderingControl on the room's own player)
// ============================================================================
// EQ always goes to the room's visible player, which is the primary of any bonded
// set (soundbar + sub + surrounds, or a stereo pair), so it covers the whole room.

const rendering = (ip, action, args = {}) =>
  soap(ip, 'RenderingControl', action, { InstanceID: 0, ...args });

// Sonos has used both spellings for the sub on/off EQ type ("SubEnable" is what
// SoCo sends), so try each and use whichever the player accepts.
const SUB_ENABLE_TYPES = ['SubEnable', 'SubEnabled'];

const asBool = (value) => (value === null || value === undefined || value === '' ? null : value !== '0');

// Read a GetEQ value. A SOAP fault means the player doesn't have that setting -> null.
async function readEqType(ip, types) {
  for (const type of [].concat(types)) {
    try {
      return tagText(await rendering(ip, 'GetEQ', { EQType: type }), 'CurrentValue');
    } catch (err) {
      if (!err.fault) throw err; // unreachable player: a real error, not "unsupported"
    }
  }
  return null;
}

async function writeEqType(ip, types, value) {
  let lastError;
  for (const type of [].concat(types)) {
    try {
      await rendering(ip, 'SetEQ', { EQType: type, DesiredValue: value });
      return;
    } catch (err) {
      if (!err.fault) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

async function sonosReadEq(room) {
  const ip = room.ip;
  const bass = toInt(tagText(await rendering(ip, 'GetBass'), 'CurrentBass'));
  const treble = toInt(tagText(await rendering(ip, 'GetTreble'), 'CurrentTreble'));
  const loudness = tagText(await rendering(ip, 'GetLoudness', { Channel: 'Master' }), 'CurrentLoudness') === '1';
  // Sub and home theater settings only exist in some rooms; null = not available here.
  const subGain = room.hasSub ? toInt(await readEqType(ip, 'SubGain')) : null;
  const subEnabled = room.hasSub ? asBool(await readEqType(ip, SUB_ENABLE_TYPES)) : null;
  const nightMode = room.isHomeTheater ? asBool(await readEqType(ip, 'NightMode')) : null;
  const dialogLevel = room.isHomeTheater ? asBool(await readEqType(ip, 'DialogLevel')) : null;
  return { roomId: room.id, bass, treble, loudness, subGain, subEnabled, nightMode, dialogLevel };
}

async function sonosWriteEq(room, patch) {
  const ip = room.ip;
  if (patch.bass !== undefined) await rendering(ip, 'SetBass', { DesiredBass: patch.bass });
  if (patch.treble !== undefined) await rendering(ip, 'SetTreble', { DesiredTreble: patch.treble });
  if (patch.loudness !== undefined) {
    await rendering(ip, 'SetLoudness', { Channel: 'Master', DesiredLoudness: patch.loudness ? 1 : 0 });
  }
  if (patch.subGain !== undefined) await writeEqType(ip, 'SubGain', patch.subGain);
  if (patch.subEnabled !== undefined) await writeEqType(ip, SUB_ENABLE_TYPES, patch.subEnabled ? 1 : 0);
  if (patch.nightMode !== undefined) await writeEqType(ip, 'NightMode', patch.nightMode ? 1 : 0);
  if (patch.dialogLevel !== undefined) await writeEqType(ip, 'DialogLevel', patch.dialogLevel ? 1 : 0);
}

async function sonosSetVolume(room, volume) {
  await rendering(room.ip, 'SetVolume', { Channel: 'Master', DesiredVolume: volume });
  try { // read it back: a room with a max-volume limit may have capped it
    const current = toInt(tagText(await rendering(room.ip, 'GetVolume', { Channel: 'Master' }), 'CurrentVolume'));
    return current ?? volume;
  } catch {
    return volume;
  }
}

// ============================================================================
// Spotify on Sonos
// ============================================================================
// Sonos streams Spotify through the account linked in the Sonos app. To start any
// track we hand the coordinator a Sonos-style URI plus DIDL metadata naming the
// music service (the approach of SoCo's ShareLinkPlugin and node-sonos-http-api):
//   sid = Sonos's id for Spotify: 12 today, 9 on some older systems
//   sn  = which linked Spotify account inside this Sonos system (1, 2, 3...)
//   serviceType = sid * 256 + 7 (12 -> 3079, 9 -> 2311), used in the metadata token
// sid and sn are visible in the URI of any Spotify item saved in Sonos Favorites.

// Returns {sid, sn} (sn may be null), null if no Spotify favorite was found, or
// undefined if no player could be asked (so the previous answer is kept).
async function detectSpotifyAccount(ips) {
  for (const ip of ips) {
    let xml;
    try {
      xml = await soap(ip, 'ContentDirectory', 'Browse', {
        ObjectID: 'FV:2', // Sonos Favorites
        BrowseFlag: 'BrowseDirectChildren',
        Filter: 'dc:title,res,upnp:class,r:resMD',
        StartingIndex: 0,
        RequestedCount: 100,
        SortCriteria: '',
      });
    } catch (err) {
      log(`Could not read Sonos Favorites from ${ip}: ${err.message}`);
      continue;
    }
    return parseSpotifyAccount(xml);
  }
  return undefined;
}

// Favorites are escaped several layers deep (DIDL inside SOAP, resMD inside DIDL)
// and their URIs are URL-encoded, so unescape repeatedly, then read each URI.
function parseSpotifyAccount(xml) {
  let text = String(xml);
  for (let i = 0; i < 4; i++) text = xmlUnescape(text);
  const votes = new Map(); // "sid:sn" -> count; the most common account wins
  for (const raw of text.match(/[^\s"'<>]*\bsid=\d+[^\s"'<>]*/g) || []) {
    let uri = raw;
    try { uri = decodeURIComponent(raw); } catch { /* keep it raw */ }
    if (!/spotify/i.test(uri)) continue;
    const sid = toInt(/[?&]sid=(\d+)/.exec(uri)?.[1]);
    const sn = toInt(/[?&]sn=(\d+)/.exec(uri)?.[1]);
    if ((sid === 12 || sid === 9) && sn !== null) votes.set(`${sid}:${sn}`, (votes.get(`${sid}:${sn}`) || 0) + 1);
  }
  if (votes.size) {
    const [best] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    const [sid, sn] = best.split(':').map(Number);
    return { sid, sn };
  }
  // No usable URI, but a Spotify token in the metadata still reveals the service id.
  const serviceType = toInt(/SA_RINCON(3079|2311)_/.exec(text)?.[1]);
  return serviceType ? { sid: (serviceType - 7) / 256, sn: null } : null;
}

const SPOTIFY_KINDS = {
  track: {
    uri: (enc, sid, sn) => `x-sonos-spotify:${enc}?sid=${sid}&flags=8224&sn=${sn}`,
    itemPrefix: '00032020',
    upnpClass: 'object.item.audioItem.musicTrack',
  },
  album: {
    uri: (enc) => `x-rincon-cpcontainer:1004206c${enc}`,
    itemPrefix: '1004206c',
    upnpClass: 'object.container.album.musicAlbum',
  },
  playlist: {
    uri: (enc) => `x-rincon-cpcontainer:1006206c${enc}`,
    itemPrefix: '1006206c',
    upnpClass: 'object.container.playlistContainer',
  },
};

function spotifyDidl(itemId, upnpClass, serviceType) {
  return '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" '
    + 'xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" '
    + 'xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" '
    + 'xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">'
    + `<item id="${itemId}" parentID="" restricted="true"><dc:title></dc:title>`
    + `<upnp:class>${upnpClass}</upnp:class>`
    + '<desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">'
    + `SA_RINCON${serviceType}_X_#Svc${serviceType}-0-Token</desc></item></DIDL-Lite>`;
}

// Queue (and for "replace", start) Spotify content on a group coordinator.
// coordinator = {id, ip}; item = {kind, id}; account = {sid, sn}.
async function sonosPlaySpotify(coordinator, item, mode, account) {
  const kind = SPOTIFY_KINDS[item.kind];
  const encoded = `spotify%3a${item.kind}%3a${item.id}`;
  const uri = kind.uri(encoded, account.sid, account.sn);
  const metadata = spotifyDidl(`${kind.itemPrefix}${encoded}`, kind.upnpClass, account.sid * 256 + 7);
  const av = (action, args = {}) => soap(coordinator.ip, 'AVTransport', action, { InstanceID: 0, ...args });

  const enqueue = async (position, asNext) => {
    try {
      await av('AddURIToQueue', {
        EnqueuedURI: uri,
        EnqueuedURIMetaData: metadata, // escaped by soap() like every argument
        DesiredFirstTrackNumberEnqueued: position, // 0 = end of the queue
        EnqueueAsNext: asNext ? 1 : 0,
      });
    } catch (err) {
      if (!err.fault) throw err;
      throw new HttpError(502, `Sonos refused the Spotify item (${err.code !== null ? `UPnP error ${err.code}` : 'SOAP fault'}). `
        + 'Spotify may not be linked in the Sonos app, or the Spotify account number is wrong '
        + `(the hub used sid=${account.sid}, sn=${account.sn}). Try restarting the hub with --spotify-sn 2 `
        + '(then 3, 4...), or save any Spotify song to Sonos Favorites so the hub can detect it.');
    }
  };

  if (mode === 'replace') {
    await av('RemoveAllTracksFromQueue');
    await enqueue(0, false);
    // Point the player at its own queue, jump to the first track and play.
    await av('SetAVTransportURI', { CurrentURI: `x-rincon-queue:${coordinator.id}#0`, CurrentURIMetaData: '' });
    await av('Seek', { Unit: 'TRACK_NR', Target: 1 });
    await av('Play', { Speed: 1 });
  } else if (mode === 'next') {
    const current = toInt(tagText(await av('GetPositionInfo'), 'Track')) || 0;
    await enqueue(current > 0 ? current + 1 : 0, true);
  } else {
    await enqueue(0, false);
  }
}

// ============================================================================
// Backends: the real Sonos house, or a mock one for testing
// ============================================================================
// Both expose the same methods. Validation, room lookup and HTTP sit above them and
// are shared, so mock mode exercises the same API code as the real thing.

function createSonosBackend(opts) {
  let knownIps = []; // remembered between scans in case SSDP has a bad moment
  return {
    mock: false,
    async scan() {
      const { rooms, players } = await discoverSonos(opts.ips, knownIps);
      knownIps = [...new Set(players.values())];
      const flagsSetBoth = opts.spotifySid !== null && opts.spotifySn !== null;
      const spotify = flagsSetBoth ? undefined : await detectSpotifyAccount(rooms.map((r) => r.ip).filter(Boolean));
      return { rooms, players, spotify };
    },
    readEq: sonosReadEq,
    writeEq: sonosWriteEq,
    setVolume: sonosSetVolume,
    play: sonosPlaySpotify,
  };
}

function createMockBackend() {
  const house = [
    { n: 1, name: 'Living Room', model: 'Arc', hasSub: true, isHomeTheater: true, volume: 22,
      eq: { bass: 1, treble: 0, loudness: true, subGain: 2, subEnabled: true, nightMode: false, dialogLevel: false } },
    { n: 2, name: 'Patio', model: 'Move', hasSub: false, isHomeTheater: false, volume: 35,
      eq: { bass: 3, treble: 1, loudness: true, subGain: null, subEnabled: null, nightMode: null, dialogLevel: null } },
    { n: 3, name: 'Garage', model: 'Era 100', hasSub: true, isHomeTheater: false, volume: 40,
      eq: { bass: 4, treble: -1, loudness: true, subGain: 3, subEnabled: true, nightMode: null, dialogLevel: null } },
  ];
  const state = new Map();
  const rooms = house.map((h) => {
    const id = `RINCON_MOCK${String(h.n).padStart(11, '0')}01400`; // RINCON_MOCK0000000000101400
    state.set(id, { eq: { ...h.eq }, volume: h.volume });
    return {
      id, name: h.name, model: h.model, ip: `192.168.50.${10 + h.n}`,
      coordinatorId: id, isCoordinator: true, memberIds: [id], // each room is its own group
      hasSub: h.hasSub, isHomeTheater: h.isHomeTheater,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return {
    mock: true,
    async scan() {
      await new Promise((r) => setTimeout(r, 150)); // feel a little like a network
      return {
        rooms: rooms.map((r) => ({ ...r, memberIds: [...r.memberIds] })),
        players: new Map(rooms.map((r) => [r.id, r.ip])),
        spotify: { sid: 12, sn: 3 }, // as if found in Sonos Favorites
      };
    },
    async readEq(room) { return { roomId: room.id, ...state.get(room.id).eq }; },
    async writeEq(room, patch) { Object.assign(state.get(room.id).eq, patch); },
    async setVolume(room, volume) { state.get(room.id).volume = volume; return volume; },
    async play(coordinator, item, mode, account) {
      log(`[mock] ${mode}: spotify:${item.kind}:${item.id} on ${coordinator.id} (sid ${account.sid}, sn ${account.sn})`);
    },
  };
}

// ============================================================================
// Hub state: scanning, room lookup, Spotify account
// ============================================================================

function createHub(backend, opts) {
  let rooms = [];
  let players = new Map();
  let lastScan = null; // ms timestamp of the last finished scan
  let detectedSpotify = null;
  let scanning = null;

  async function runScan(reason) {
    const started = Date.now();
    try {
      const before = rooms.map((r) => r.id).join();
      const result = await backend.scan();
      rooms = result.rooms;
      players = result.players;
      if (result.spotify !== undefined) detectedSpotify = result.spotify;
      lastScan = Date.now();
      const changed = rooms.map((r) => r.id).join() !== before;
      if (reason !== 'timer' || changed) {
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        log(`Scan (${reason}) found ${rooms.length} room(s) in ${secs}s${rooms.length ? `: ${rooms.map((r) => r.name).join(', ')}` : ''}`);
        if (!rooms.length) printNoPlayersHint(opts);
      }
    } catch (err) {
      log(`Scan failed, keeping the previous rooms: ${err?.stack || err}`);
    }
    return rooms;
  }

  // One scan at a time; callers that arrive mid-scan share its result.
  function scan(reason = 'manual') {
    if (!scanning) scanning = runScan(reason).finally(() => { scanning = null; });
    return scanning;
  }

  async function getRooms() {
    if (lastScan === null) await scan('startup');
    return rooms;
  }

  async function findRoom(rawId) {
    let id;
    try { id = decodeURIComponent(rawId).replace(/^uuid:/i, ''); } catch { id = ''; }
    if (!/^[A-Za-z0-9_:.-]{1,80}$/.test(id)) throw new HttpError(400, 'That room id is not valid');
    await getRooms();
    const match = () => rooms.find((r) => r.id === id) || rooms.find((r) => r.id.toLowerCase() === id.toLowerCase());
    let room = match();
    if (!room && (lastScan === null || Date.now() - lastScan > 30_000)) {
      await scan('lookup'); // maybe a speaker that just joined the network
      room = match();
    }
    if (!room) throw new HttpError(404, `No room with id "${id}". GET /rooms lists the room ids.`);
    return room;
  }

  // Playback goes to the coordinator of the room's group.
  function coordinatorOf(room) {
    const id = room.coordinatorId || room.id;
    return { id, ip: players.get(id) || rooms.find((r) => r.id === id)?.ip || room.ip };
  }

  // Flags beat detection, detection beats the defaults (sid 12, sn 1).
  function spotifyAccount() {
    const fromFlag = opts.spotifySid !== null || opts.spotifySn !== null;
    return {
      sid: opts.spotifySid ?? detectedSpotify?.sid ?? 12,
      sn: opts.spotifySn ?? detectedSpotify?.sn ?? 1,
      source: fromFlag ? 'flag' : detectedSpotify ? 'favorites' : 'default',
    };
  }

  return {
    scan, getRooms, findRoom, coordinatorOf, spotifyAccount,
    get rooms() { return rooms; },
    get lastScan() { return lastScan; },
  };
}

function printNoPlayersHint(opts) {
  console.log([
    '',
    '  No Sonos players found. If this computer is on the same network as the speakers:',
    '   1. Allow Node.js through Windows Firewall on Private networks (see README),',
    '      then restart the hub (or POST /rescan).',
    '   2. Or point the hub straight at a speaker:  node compass-hub.mjs --ip 192.168.1.50',
    '      (speaker IPs are in the Sonos app under About My System, or in your router).',
    ...(opts.ips.length ? [`   Tried --ip ${opts.ips.join(', ')} as well; nothing answered on port ${SONOS_PORT}.`] : []),
    '',
  ].join('\n'));
}

// ============================================================================
// HTTP API: input checks
// ============================================================================

const EQ_FIELDS = {
  bass: { kind: 'int', min: -10, max: 10 },
  treble: { kind: 'int', min: -10, max: 10 },
  loudness: { kind: 'bool' },
  subGain: { kind: 'int', min: -15, max: 15, needs: 'sub' },
  subEnabled: { kind: 'bool', needs: 'sub' },
  nightMode: { kind: 'bool', needs: 'theater' },
  dialogLevel: { kind: 'bool', needs: 'theater' },
};

function parseBool(value, name) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === 0) return value === 1;
  if (typeof value === 'string' && /^(true|false|1|0|on|off)$/i.test(value.trim())) {
    return /^(true|1|on)$/i.test(value.trim());
  }
  throw new HttpError(400, `${name} must be true or false`);
}

// Numbers are rounded and clamped into range rather than rejected.
function parseNumber(value, name, min, max) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new HttpError(400, `${name} must be a number from ${min} to ${max}`);
  }
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parseEqPatch(body, room) {
  const patch = {};
  for (const [name, field] of Object.entries(EQ_FIELDS)) {
    const value = body[name];
    if (value === undefined || value === null) continue; // null = leave alone, so a GET result can be sent back
    patch[name] = field.kind === 'bool' ? parseBool(value, name) : parseNumber(value, name, field.min, field.max);
    if (field.needs === 'sub' && !room.hasSub) {
      throw new HttpError(400, `${room.name} has no Sub, so ${name} can't be set`);
    }
    if (field.needs === 'theater' && !room.isHomeTheater) {
      throw new HttpError(400, `${room.name} isn't a home theater speaker, so ${name} can't be set`);
    }
  }
  if (!Object.keys(patch).length) {
    throw new HttpError(400, `Send at least one of: ${Object.keys(EQ_FIELDS).join(', ')}`);
  }
  return patch;
}

// Accepts spotify:track:ID, spotify:album:ID, spotify:playlist:ID, and also
// open.spotify.com share links, which people tend to paste.
function parseSpotifyUri(value) {
  const m = typeof value === 'string'
    && /spotify.*?[:/](track|album|playlist)[:/]([A-Za-z0-9]{10,40})/i.exec(value.trim());
  if (!m) throw new HttpError(400, 'uri must look like spotify:track:ID, spotify:album:ID or spotify:playlist:ID');
  return { kind: m[1].toLowerCase(), id: m[2] };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) return reject(new HttpError(413, 'Request body is too large'));
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) return resolve({});
      try {
        const data = JSON.parse(text);
        if (data && typeof data === 'object' && !Array.isArray(data)) return resolve(data);
      } catch { /* fall through */ }
      return reject(new HttpError(400, 'Body must be a JSON object'));
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  if (res.headersSent) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

// Fixed one-minute windows per client. Returns 0 if allowed, else seconds to wait.
function createRateLimiter(limit, windowMs) {
  const windows = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [client, w] of windows) if (now - w.start >= windowMs) windows.delete(client);
  }, windowMs).unref();
  return (client) => {
    const now = Date.now();
    let w = windows.get(client);
    if (!w || now - w.start >= windowMs) {
      w = { start: now, count: 0 };
      windows.set(client, w);
    }
    w.count += 1;
    return w.count <= limit ? 0 : Math.max(1, Math.ceil((w.start + windowMs - now) / 1000));
  };
}

// ============================================================================
// HTTP API: server and routes
// ============================================================================

function createApiServer({ hub, backend, opts, key }) {
  const allowedOrigins = new Set([...DEFAULT_ORIGINS, ...opts.origins]);
  const isAllowedOrigin = (origin) => {
    const o = String(origin).toLowerCase();
    return allowedOrigins.has(o) || VERCEL_PREVIEW_ORIGIN.test(o);
  };
  const limiter = createRateLimiter(RATE_LIMIT_PER_MIN, 60_000);

  // Hash both sides first: equal-length buffers mean timingSafeEqual never throws on
  // a length mismatch, and the comparison doesn't leak the key's length either.
  const keyHash = crypto.createHash('sha256').update(key).digest();
  const keyMatches = (given) => typeof given === 'string'
    && crypto.timingSafeEqual(crypto.createHash('sha256').update(given).digest(), keyHash);

  const ping = () => ({ ok: true, app: 'compass-hub', version: VERSION, mock: backend.mock });

  // "METHOD /path" or "METHOD /path/:id" -> handler({ room, body })
  const routes = {
    'GET /': ping,
    'GET /ping': ping,
    'GET /status': () => ({
      ok: true,
      version: VERSION,
      mock: backend.mock,
      players: hub.rooms.length,
      lastScan: hub.lastScan === null ? null : new Date(hub.lastScan).toISOString(),
      spotify: hub.spotifyAccount(),
    }),
    'GET /rooms': async () => ({ rooms: await hub.getRooms() }),
    'POST /rescan': async () => ({ rooms: await hub.scan('manual') }),
    'GET /eq/:id': ({ room }) => backend.readEq(room),
    'POST /eq/:id': async ({ room, body }) => {
      const patch = parseEqPatch(body, room);
      await backend.writeEq(room, patch);
      return backend.readEq(room); // fresh values, read back from the speaker
    },
    'POST /volume/:id': async ({ room, body }) => {
      if (body.volume === undefined || body.volume === null) throw new HttpError(400, 'Send {"volume": 0-100}');
      const volume = parseNumber(body.volume, 'volume', 0, 100);
      return { roomId: room.id, volume: await backend.setVolume(room, volume) };
    },
    'POST /play/:id': async ({ room, body }) => {
      const item = parseSpotifyUri(body.uri);
      const mode = body.mode ?? 'replace';
      if (!['replace', 'next', 'append'].includes(mode)) {
        throw new HttpError(400, 'mode must be "replace", "next" or "append"');
      }
      const coordinator = hub.coordinatorOf(room);
      await backend.play(coordinator, item, mode, hub.spotifyAccount());
      return {
        ok: true, roomId: room.id, coordinatorId: coordinator.id,
        uri: `spotify:${item.kind}:${item.id}`, mode, ...(backend.mock ? { mock: true } : {}),
      };
    },
    'GET /spotify': () => hub.spotifyAccount(),
  };
  const PUBLIC = new Set(['/', '/ping']);

  async function handle(req, res) {
    const pathname = new URL(req.url || '/', 'http://hub').pathname.replace(/\/+$/, '') || '/';
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (origin !== undefined) {
      if (!isAllowedOrigin(origin)) {
        throw new HttpError(403, `Origin ${origin} is not allowed. Start the hub with --origin ${origin} to allow it.`);
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    // Through a Cloudflare tunnel every request arrives from 127.0.0.1, so use the
    // visitor's address that cloudflared passes along (only trusted from loopback).
    const remote = req.socket.remoteAddress || '';
    const forwarded = req.headers['cf-connecting-ip'];
    const client = forwarded && /^(::1|127\.|::ffff:127\.)/.test(remote) ? String(forwarded) : remote;
    const wait = limiter(client);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      throw new HttpError(429, 'Too many requests. Please slow down for a moment.');
    }

    if (req.method === 'OPTIONS') {
      // CORS preflight. Allow-Private-Network answers Chrome's Private Network Access
      // check, sent when a public https page calls a server on the home network.
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Hub-Key',
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Max-Age': '600',
      });
      res.end();
      return;
    }

    const parts = pathname === '/' ? [] : pathname.slice(1).split('/');
    const pattern = parts.length === 0 ? '/' : parts.length === 1 ? `/${parts[0]}`
      : parts.length === 2 ? `/${parts[0]}/:id` : null;
    const handler = pattern && routes[`${req.method} ${pattern}`];
    if (!handler) {
      const allowed = pattern ? ['GET', 'POST'].filter((m) => routes[`${m} ${pattern}`]) : [];
      if (allowed.length) {
        res.setHeader('Allow', [...allowed, 'OPTIONS'].join(', '));
        throw new HttpError(405, `Use ${allowed.join(' or ')} for ${pathname}`);
      }
      throw new HttpError(404, `Not found: ${req.method} ${pathname}`);
    }

    if (!PUBLIC.has(pattern) && !keyMatches(req.headers['x-hub-key'])) {
      throw new HttpError(401, 'Missing or wrong X-Hub-Key header');
    }
    const body = req.method === 'POST' ? await readJson(req) : {};
    const room = parts.length === 2 ? await hub.findRoom(parts[1]) : null;
    sendJson(res, 200, await handler({ room, body }));
  }

  return http.createServer((req, res) => {
    const started = Date.now();
    handle(req, res)
      .catch((err) => {
        if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
        if (err instanceof UpnpError) return sendJson(res, err.timeout ? 504 : 502, { error: err.message });
        log(`Unexpected error on ${req.method} ${req.url}: ${err?.stack || err}`);
        return sendJson(res, 500, { error: 'Something went wrong inside the hub' });
      })
      .finally(() => {
        if (req.method !== 'OPTIONS' && !/^\/(ping)?$/.test(req.url || '')) {
          log(`${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - started} ms)`);
        }
      });
  });
}

// ============================================================================
// Optional Cloudflare quick tunnel (--tunnel)
// ============================================================================
// Phones load the app over https, and an https page may not call a plain http
// address on the home network. A quick tunnel gives the hub a temporary public
// https URL (the key still protects it). Never blocks startup.

let tunnelChild = null;

function startTunnel(port, host) {
  const target = `http://${host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host}:${port}`;
  const candidates = ['cloudflared'];
  if (process.platform === 'win32') { // winget installs here, and PATH may not be refreshed yet
    for (const dir of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]) {
      const exe = dir && path.join(dir, 'cloudflared', 'cloudflared.exe');
      if (exe && fs.existsSync(exe)) candidates.push(exe);
    }
  }
  const tryCandidate = (i) => {
    if (i >= candidates.length) {
      console.log([
        '',
        '  --tunnel: cloudflared is not installed (or not on PATH), so no tunnel was started.',
        '    Windows:       winget install --id Cloudflare.cloudflared   (then open a new window)',
        '    Raspberry Pi:  see https://pkg.cloudflare.com/ or the cloudflared GitHub releases',
        `    Then run:      cloudflared tunnel --url ${target}`,
        '',
      ].join('\n'));
      return;
    }
    let child;
    try {
      child = spawn(candidates[i], ['tunnel', '--url', target], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch {
      tryCandidate(i + 1);
      return;
    }
    let spawned = false;
    let announced = false;
    let output = '';
    const onOutput = (chunk) => {
      if (announced) return;
      output = (output + chunk.toString()).slice(-8000);
      const url = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(output)?.[0];
      if (!url) return;
      announced = true;
      console.log([
        '',
        '############################################################',
        '  Tunnel ready. Paste this into the app (Settings > Home hub):',
        '',
        `     ${url}`,
        '',
        '  It changes every time the tunnel restarts. The key stays the same.',
        '############################################################',
        '',
      ].join('\n'));
    };
    child.on('spawn', () => {
      spawned = true;
      tunnelChild = child;
      log(`Starting a Cloudflare quick tunnel to ${target} ...`);
    });
    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
    child.on('error', (err) => {
      if (!spawned && err.code === 'ENOENT') tryCandidate(i + 1);
      else log(`cloudflared error: ${err.message}`);
    });
    child.on('exit', (code) => {
      if (spawned) log(`cloudflared stopped (exit code ${code}). The tunnel URL no longer works.`);
      if (tunnelChild === child) tunnelChild = null;
    });
  };
  tryCandidate(0);
}

// ============================================================================
// Startup
// ============================================================================

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && (i.family === 'IPv4' || i.family === 4) && !i.internal)
    .map((i) => i.address);
}

function printBanner({ opts, key, keySource, hub, backend }) {
  const shownHost = opts.host === '0.0.0.0' || opts.host === '::' ? '127.0.0.1' : opts.host;
  const rooms = hub.rooms;
  const spotify = hub.spotifyAccount();
  const keyNote = keySource === 'flag' ? 'from --key, not saved'
    : keySource === 'new' ? `new, saved in ${CONFIG_PATH}` : `saved in ${CONFIG_PATH}`;
  console.log([
    '',
    '============================================================',
    `  Compass Classics home hub v${VERSION}`,
    '============================================================',
    `  Local URL : http://${shownHost}:${opts.port}`,
    ...(opts.host === '0.0.0.0' ? lanAddresses().map((a) => `  LAN URL   : http://${a}:${opts.port}`) : []),
    `  Hub key   : ${key}`,
    `              (${keyNote})`,
    `  Sonos     : ${rooms.length} player${rooms.length === 1 ? '' : 's'} found`
      + `${rooms.length ? ` (${rooms.map((r) => r.name).join(', ')})` : ''}`,
    `  Mock mode : ${backend.mock ? 'ON (pretend house, no real speakers)' : 'off'}`,
    `  Spotify   : sid ${spotify.sid}, account sn ${spotify.sn} (${spotify.source})`,
    '',
    '  In the app: Settings > Home hub, paste the hub URL and the key.',
    '  Phones need an https URL: start with --tunnel (see README).',
    '  Press Ctrl+C to stop.',
    '============================================================',
    '',
  ].join('\n'));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }
  if (Number(process.versions.node.split('.')[0]) < 18) fail('Node 18 or newer is required (Node LTS recommended)');

  const { key, source: keySource } = resolveKey(opts.key);
  const backend = opts.mock ? createMockBackend() : createSonosBackend(opts);
  const hub = createHub(backend, opts);
  const server = createApiServer({ hub, backend, opts, key });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') fail(`Port ${opts.port} is already in use. Is the hub already running? Or try --port ${opts.port + 1}`);
    if (err.code === 'EADDRNOTAVAIL') fail(`${opts.host} is not an address of this computer`);
    fail(`Could not start the web server: ${err.message}`);
  });
  await new Promise((resolve) => server.listen(opts.port, opts.host, resolve));
  log(`Listening on ${opts.host}:${opts.port}. ${backend.mock ? 'Setting up the mock house...' : 'Looking for Sonos players (takes a few seconds)...'}`);

  if (opts.tunnel) startTunnel(opts.port, opts.host);
  await hub.scan('startup');
  printBanner({ opts, key, keySource, hub, backend });
  setInterval(() => hub.scan('timer'), RESCAN_EVERY_MS).unref();

  const shutdown = () => {
    log('Stopping the hub.');
    try { tunnelChild?.kill(); } catch { /* already gone */ }
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// A home hub should keep running through surprises; log them instead of crashing.
process.on('unhandledRejection', (err) => log(`Unexpected problem: ${err?.stack || err}`));
process.on('uncaughtException', (err) => log(`Unexpected problem: ${err?.stack || err}`));
process.on('exit', () => { try { tunnelChild?.kill(); } catch { /* ignore */ } });

main();
