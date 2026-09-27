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
