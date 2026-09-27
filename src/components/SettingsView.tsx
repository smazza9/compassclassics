"use client";

import { useEffect, useState } from "react";
import { useHouse } from "@/lib/house";
import * as sp from "@/lib/spotify";
import { testTone } from "@/lib/spotifyPlayer";
import { defaultScenes, type Scene } from "@/lib/scenes";
import { errorText } from "@/lib/util";
import { EqControls } from "./EqControls";
import { Icon, deviceIcon } from "./Icons";
import { Spinner } from "./ui";

function Status({ on, warn, label }: { on: boolean; warn?: boolean; label: string }) {
  return (
    <span className={on ? "ok" : warn ? "warn" : "off"}>
      <i />
      {label}
    </span>
  );
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn sm"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          },
          () => {},
        );
      }}
    >
      <Icon name={done ? "check" : "link"} />
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function SettingsView() {
  const h = useHouse();
  return (
    <div className="view">
      <h1 className="headline" style={{ marginTop: 6 }}>
        Settings
      </h1>
      <p className="subline">Connect the speakers, accounts and extras. Everything here is only on this device.</p>
      <div className="set-grid">
        <div>
          <SonosSection />
          <SpotifySection />
          <DevicesSection />
          <SearchToSonosSection />
        </div>
        <div>
          <HubSection />
          <SoundSection />
          {h.live ? <ScenesSection /> : null}
          <AssistantSection />
          <HomeScreenSection />
        </div>
      </div>
      <footer className="signature">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-720.webp" alt="Compass Classics" width={200} height={200} />
        <p>Made for Dad by Stephen</p>
        <small>Compass Classics · Happy birthday</small>
      </footer>
    </div>
  );
}

/* ---------- Sonos ---------- */

function SonosSection() {
  const h = useHouse();
  const c = h.config;
  const players = h.snap?.players ?? [];
  const speakers = players.reduce((n, p) => n + (p.deviceIds?.length ?? 1), 0);
  return (
    <section className="set">
      <div className="set-row">
        <div>
          <h3>
            <Icon name="speaker" />
            Dad&apos;s Sonos
          </h3>
          <p>{h.live ? players.length + " rooms · " + speakers + " speakers" : c?.sonosLinked ? "Linked, loading rooms" : "Not linked on this device"}</p>
        </div>
        <Status on={h.live} warn={!!c?.sonosLinked && !h.live} label={h.live ? "Connected" : c?.sonosLinked ? "Loading" : "Off"} />
      </div>
      {h.live ? (
        <>
          <ul className="list">
            {players.map((p) => (
              <li key={p.id}>
                <Icon name="speaker" />
                <span className="grow">
                  <b>{p.name}</b>
                  <small>
                    {(p.deviceIds?.length ?? 1) > 1 ? (p.deviceIds?.length ?? 1) + " speakers bonded" : "1 speaker"}
                    {p.capabilities?.includes("HT_PLAYBACK") ? " · TV sound" : ""}
                    {p.capabilities?.includes("LINE_IN") ? " · Line in" : ""}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          <p className="set-note">Rooms, speakers and favorites come straight from his Sonos system and stay in sync with the Sonos app.</p>
          <div className="set-actions">
            <button className="btn sm" onClick={() => h.a.refreshSonos()}>
              <Icon name="refresh" />
              Refresh
            </button>
            <button className="btn sm danger" onClick={() => h.a.unlinkSonos()}>
              Unlink
            </button>
          </div>
        </>
      ) : c?.sonosReady ? (
        <>
          <p className="set-note">
            Sign in with the Sonos account his speakers use. It works from anywhere, so anything you press here plays at his house.
          </p>
          <div className="set-actions">
            <a className="btn gold" href="/api/sonos/login">
              <Icon name="link" />
              Link Sonos
            </a>
          </div>
        </>
      ) : (
        <p className="set-note">
          Waiting on the Sonos developer key. Once the key and secret are added to the app on Vercel, a Link Sonos button appears here.
        </p>
      )}
    </section>
  );
}

/* ---------- Spotify ---------- */

function SpotifySection() {
  const h = useHouse();
  const [idInput, setIdInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const clientId = h.config?.spotifyClientId ?? null;
  const redirect = typeof location !== "undefined" ? location.origin + "/spotify/callback" : "https://compassclassics.com/spotify/callback";

  const login = async (choose = false) => {
    if (!clientId) return;
    setErr(null);
    try {
      await sp.beginLogin(clientId, { chooseAccount: choose, returnTo: "/?view=settings" });
    } catch (e) {
      setErr(errorText(e));
    }
  };

  return (
    <section className="set">
      <div className="set-row">
        <div>
          <h3>
            <Icon name="music" />
            Spotify
          </h3>
          <p>{h.accounts.length ? h.accounts.length + (h.accounts.length > 1 ? " accounts" : " account") + " signed in" : "Search every song, play on Spotify speakers"}</p>
        </div>
        <Status on={!!h.accounts.length} label={h.accounts.length ? "Ready" : "Off"} />
      </div>

      {h.accounts.length ? (
        <ul className="list">
          {h.accounts.map((a, i) => (
            <li key={a.id}>
              <Icon name="user" />
              <span className="grow">
                <b>{a.name}</b>
                <small>{i === 0 ? "Used for search" : "Extra account for another speaker"}</small>
              </span>
              {i > 0 ? (
                <button className="btn sm" onClick={() => sp.makePrimary(a.id)}>
                  Use for search
                </button>
              ) : null}
              <button className="icon-btn sm" aria-label={"Sign out " + a.name} onClick={() => sp.removeAccount(a.id)}>
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {clientId ? (
        <div className="set-actions">
          <button className="btn gold" onClick={() => login(h.accounts.length > 0)}>
            <Icon name="plus" />
            {h.accounts.length ? "Add another account" : "Connect Spotify"}
          </button>
        </div>
      ) : (
        <>
          <p className="set-note">
            Paste the Client ID from the Spotify developer dashboard (open the app there, it&apos;s at the top of Settings). It isn&apos;t a
            secret, it just tells Spotify which app is asking.
          </p>
          <label className="field">
            <span>Spotify Client ID</span>
            <input value={idInput} onChange={(e) => setIdInput(e.target.value)} placeholder="32 letters and numbers" autoComplete="off" spellCheck={false} />
          </label>
          <div className="set-actions">
            <button
              className="btn gold"
              disabled={!/^[a-f0-9]{32}$/i.test(idInput.trim())}
              onClick={() => {
                sp.setClientIdOverride(idInput.trim());
                void h.a.loadConfig();
              }}
            >
              Save Client ID
            </button>
          </div>
        </>
      )}
      {err ? <p className="set-note" style={{ color: "#fca5a5" }}>{err}</p> : null}

      <details style={{ marginTop: 12 }}>
        <summary className="set-note" style={{ cursor: "pointer", marginTop: 0 }}>
          Spotify dashboard checklist
        </summary>
        <ol className="steps">
          <li>
            Redirect URI: <code>{redirect}</code> <Copy text={redirect} />
          </li>
          <li>APIs used: Web API and Web Playback SDK.</li>
          <li>User Management: add each person&apos;s Spotify email (up to 5). Anyone not listed gets blocked.</li>
          <li>Playing music from the app needs Spotify Premium.</li>
        </ol>
      </details>
    </section>
  );
}

/* ---------- Devices ---------- */

function DevicesSection() {
  const h = useHouse();
  const [testing, setTesting] = useState(false);
  const b = h.browser;
  const hasAcct = !!h.accounts.length;
  return (
    <section className="set">
      <div className="set-row">
        <div>
          <h3>
            <Icon name="bluetooth" />
            Speakers and devices
          </h3>
          <p>This device, Bluetooth, and Spotify speakers</p>
        </div>
      </div>

      <div className="set-row toggle-row">
        <div>
          <h4>This device is a speaker</h4>
          <p>
            {b.state === "ready"
              ? "Ready. It shows on the home screen as This device."
              : b.state === "loading"
                ? "Starting…"
                : b.state === "error"
                  ? b.error
                  : "Play music right here. On a PC, a Bluetooth speaker or amp connected to the PC plays it too."}
          </p>
        </div>
        <button
          className="switch"
          role="switch"
          aria-checked={b.state === "ready" || b.state === "loading"}
          aria-label="This device is a speaker"
          disabled={!hasAcct}
          onClick={() => (b.state === "ready" || b.state === "loading" ? h.a.disableBrowserPlayer() : h.a.enableBrowserPlayer())}
        >
          <i />
        </button>
      </div>
      <div className="set-actions">
        <button
          className="btn sm"
          disabled={testing}
          onClick={async () => {
            setTesting(true);
            try {
              await testTone();
            } finally {
              setTesting(false);
            }
          }}
        >
          {testing ? <Spinner /> : <Icon name="wave" />}
          Test sound
        </button>
        {hasAcct ? (
          <button className="btn sm" onClick={() => h.a.refreshSpotify(true)}>
            <Icon name="refresh" />
            Find speakers
          </button>
        ) : null}
      </div>
      <p className="set-note">
        Bluetooth: pair the speaker or amp with this phone or PC in its own Bluetooth settings, then turn on This device. Test sound
        plays a short chime through whatever this device is connected to.
      </p>

      {hasAcct ? (
        <ul className="list">
          {h.accounts.flatMap((a) =>
            (h.devices[a.id] ?? []).map((d) => (
              <li key={a.id + (d.id ?? d.name)} className={d.is_active ? "active" : undefined}>
                <Icon name={deviceIcon(d.type)} />
                <span className="grow">
                  <b>{d.id === b.deviceId ? "This device" : d.name}</b>
                  <small>
                    {d.type}
                    {h.accounts.length > 1 ? " · " + a.name : ""}
                    {d.is_restricted ? " · controlled by its own app" : d.volume_percent != null ? " · volume " + d.volume_percent : ""}
                    {d.is_active ? " · playing" : ""}
                  </small>
                </span>
              </li>
            )),
          )}
          {!h.accounts.some((a) => (h.devices[a.id] ?? []).length) ? (
            <li>
              <Icon name="info" />
              <span className="grow">
                <b>No Spotify speakers found yet</b>
                <small>Open Spotify on a phone, computer, TV or receiver and it appears here.</small>
              </span>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="set-note">Connect Spotify above to see Spotify speakers like phones, computers, TVs and receivers.</p>
      )}
    </section>
  );
}

/* ---------- Search to Sonos ---------- */

function SearchToSonosSection() {
  const h = useHouse();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  if (!h.live) return null;
  const rows = h.a.roomSetup();
  const ready = rows.filter((r) => r.favorite).length;
  const hubOk = h.hub.status === "ok";
  return (
    <section className="set">
      <div className="set-row">
        <div>
          <h3>
            <Icon name="search" />
            Play any song on Sonos
          </h3>
          <p>{hubOk ? "Using the home hub" : ready + " of " + rows.length + " rooms set up"}</p>
        </div>
        <Status on={hubOk || ready === rows.length} warn={ready > 0 && ready < rows.length} label={hubOk || ready === rows.length ? "Ready" : "Setup"} />
      </div>
      <p className="set-note">
        Sonos only lets apps start its favorites, so each room gets a Spotify playlist the app fills with whatever you pick. One time
        setup, about two minutes, done on his phone.
      </p>
      <ol className="steps">
        <li>Connect Spotify with the same account his Sonos uses.</li>
        <li>
          Tap <b>Make room playlists</b> below.
        </li>
        <li>
          In the Sonos app: Browse, Spotify, Your Library, Playlists. On each <b>Compass Classics · room</b> playlist tap the three dots,
          then <b>Add to My Sonos</b>.
        </li>
        <li>
          Come back and tap <b>Check</b>.
        </li>
      </ol>
      <ul className="list">
        {rows.map((r) => (
          <li key={r.room}>
            <Icon name={r.favorite ? "check" : "speaker"} />
            <span className="grow">
              <b>{r.room}</b>
              <small>{r.favorite ? "Ready" : "Needs " + sp.roomPlaylistName(r.room) + " in My Sonos"}</small>
            </span>
          </li>
        ))}
      </ul>
      <div className="set-actions">
        <button
          className="btn gold sm"
          disabled={busy || !h.primary}
          onClick={async () => {
            setBusy(true);
            try {
              h.a.notify(await h.a.setupRoomPlaylists());
            } catch (e) {
              h.a.notify(errorText(e), "err");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Spinner /> : <Icon name="plus" />}
          Make room playlists
        </button>
        <button
          className="btn sm"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            try {
              await h.a.loadFavorites(true);
            } catch (e) {
              h.a.notify(errorText(e), "err");
            } finally {
              setChecking(false);
            }
          }}
        >
          {checking ? <Spinner /> : <Icon name="refresh" />}
          Check
        </button>
      </div>
    </section>
  );
}

/* ---------- Home hub ---------- */

function HubSection() {
  const h = useHouse();
  const [url, setUrl] = useState(h.hubCfg?.url ?? "http://127.0.0.1:5005");
  const [key, setKey] = useState(h.hubCfg?.key ?? "");
  const [busy, setBusy] = useState(false);
  const st = h.hub;
  return (
    <section className="set">
      <div className="set-row">
        <div>
          <h3>
            <Icon name="hub" />
            Home hub
          </h3>
          <p>Unlocks bass, treble and sub, and plays any song on Sonos instantly</p>
        </div>
        <Status
          on={st.status === "ok"}
          warn={st.status === "error"}
          label={st.status === "ok" ? (st.mock ? "Test mode" : "Connected") : st.status === "checking" ? "Checking" : st.status === "error" ? "Can't reach" : "Off"}
        />
      </div>
      {st.status === "ok" ? (
        <ul className="list">
          {st.rooms.length ? (
            st.rooms.map((r) => (
              <li key={r.id}>
                <Icon name="speaker" />
                <span className="grow">
                  <b>{r.name}</b>
                  <small>
                    {r.model ?? "Sonos"}
                    {r.hasSub ? " · Sub" : ""}
                    {r.ip ? " · " + r.ip : ""}
                  </small>
                </span>
              </li>
            ))
          ) : (
            <li>
              <Icon name="info" />
              <span className="grow">
                <b>No Sonos speakers found</b>
                <small>Make sure the hub computer is on the same Wi-Fi as the speakers.</small>
              </span>
            </li>
          )}
        </ul>
      ) : null}
      {st.status === "error" ? <p className="set-note" style={{ color: "#fcd34d" }}>{st.error}</p> : null}
      <p className="set-note">
        The hub is a small program that runs on a computer at the house (later a tiny Raspberry Pi). It talks to the speakers over
        Wi-Fi, which is the only way Sonos allows EQ. Start it with <code>npm run hub</code> in the app folder, or{" "}
        <code>npm run hub:mock</code> to try it with pretend speakers. It prints the address and key to paste here.
      </p>
      <label className="field">
        <span>Hub address</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:5005" autoComplete="off" spellCheck={false} />
      </label>
      <label className="field">
        <span>Hub key</span>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="From the hub window" autoComplete="off" spellCheck={false} />
      </label>
      <div className="set-actions">
        <button
          className="btn gold sm"
          disabled={busy || !url.trim() || !key.trim()}
          onClick={async () => {
            setBusy(true);
            await h.a.connectHub({ url, key });
            setBusy(false);
          }}
        >
          {busy ? <Spinner /> : <Icon name="link" />}
          {h.hubCfg ? "Save and test" : "Connect hub"}
        </button>
        {h.hubCfg ? (
          <>
            <button className="btn sm" onClick={() => h.a.checkHub()}>
              <Icon name="refresh" />
              Test again
            </button>
            <button className="btn sm danger" onClick={() => h.a.disconnectHub()}>
              Forget
            </button>
          </>
        ) : null}
      </div>
      <p className="hint">
        On a phone, the hub needs a secure https address (the hub&apos;s README shows a free way to get one). On the same PC, the plain
        address above works.
      </p>
    </section>
  );
}

/* ---------- Sound (EQ) ---------- */

function SoundSection() {
  const h = useHouse();
  const rooms = h.rooms;
  const [room, setRoom] = useState<string>(rooms[0]?.id ?? "");
  const current = rooms.find((r) => r.id === room) ? room : (rooms[0]?.id ?? "");
  return (
    <section className="set">
      <div className="set-row">
        <div>
          <h3>
            <Icon name="eq" />
            Sound
          </h3>
          <p>Bass, treble, subwoofer and loudness for each room</p>
        </div>
      </div>
      {rooms.length ? (
        <>
          <label className="field">
            <span>Room</span>
            <select value={current} onChange={(e) => setRoom(e.target.value)}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ marginTop: 14 }}>{current ? <EqControls key={current} roomId={current} /> : null}</div>
        </>
      ) : (
        <p className="set-note">No rooms yet.</p>
      )}
    </section>
  );
}

/* ---------- Scenes (real house) ---------- */

function ScenesSection() {
  const h = useHouse();
  const [list, setList] = useState<Scene[]>(h.liveScenes);
  const [dirty, setDirty] = useState(false);
  const names = h.rooms.map((r) => r.name);
  const favs = (h.favorites ?? []).filter((f) => !f.name.startsWith(sp.ROOM_PLAYLIST_PREFIX));
  useEffect(() => {
    void h.a.loadFavorites().catch(() => {});
  }, [h.a]);

  const update = (i: number, patch: Partial<Scene>) => {
    setList((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  return (
    <section className="set">
      <div className="set-row">
        <div>
          <h3>
            <Icon name="flame" />
            Scenes
          </h3>
          <p>One tap setups on the home screen</p>
        </div>
      </div>
      {list.map((s, i) => {
        const every = s.rooms.includes("*");
        const vol = s.volumes["*"] ?? s.volumes[s.rooms[0]] ?? 40;
        return (
          <div key={s.id} className="toggle-row">
            <h4 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name={s.icon} className="sm-ic" />
              {s.name}
            </h4>
            <div className="chips" style={{ marginTop: 8 }}>
              <button className="chip" aria-pressed={every} onClick={() => update(i, { rooms: every ? [] : ["*"], note: every ? s.note : "Every room together" })}>
                <Icon name={every ? "check" : "plus"} />
                Every room
              </button>
              {!every
                ? names.map((n) => {
                    const on = s.rooms.includes(n);
                    return (
                      <button
                        key={n}
                        className="chip"
                        aria-pressed={on}
                        onClick={() => {
                          const rooms = on ? s.rooms.filter((x) => x !== n) : [...s.rooms, n];
                          update(i, { rooms, note: rooms.join(" + ") || "No rooms" });
                        }}
                      >
                        <Icon name={on ? "check" : "plus"} />
                        {n}
                      </button>
                    );
                  })
                : null}
            </div>
            <label className="field">
              <span>Music</span>
              <select
                value={s.music?.type === "sonos-favorite" ? s.music.id : ""}
                onChange={(e) => {
                  const f = favs.find((x) => x.id === e.target.value);
                  update(i, { music: f ? { type: "sonos-favorite", id: f.id, title: f.name, subtitle: "Sonos favorite", art: f.imageUrl } : null });
                }}
              >
                <option value="">Keep what&apos;s playing</option>
                {favs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="eq-row" style={{ marginTop: 8 }}>
              <span>Volume</span>
              <input
                type="range"
                min={0}
                max={100}
                value={vol}
                style={{ ["--v" as string]: vol + "%" }}
                onChange={(e) => {
                  const v = +e.target.value;
                  const volumes = every ? { "*": v } : Object.fromEntries(s.rooms.map((r) => [r, v]));
                  update(i, { volumes });
                }}
              />
              <output>{vol}</output>
            </label>
          </div>
        );
      })}
      <div className="set-actions">
        <button
          className="btn gold sm"
          disabled={!dirty}
          onClick={() => {
            h.a.saveLiveScenes(list);
            setDirty(false);
            h.a.notify("Scenes saved.");
          }}
        >
          Save scenes
        </button>
        <button
          className="btn sm"
          onClick={() => {
            const d = defaultScenes(names);
            setList(d);
            h.a.saveLiveScenes(null);
            setDirty(false);
          }}
        >
          Reset
        </button>
      </div>
    </section>
  );
}

/* ---------- Assistant ---------- */

function AssistantSection() {
  const h = useHouse();
  const c = h.config;
  const [pin, setPin] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <section className="set">
      <div className="set-row">
        <div>
          <h3>
            <Icon name="sparkle" />
            Assistant
          </h3>
          <p>Ask for music in plain words, or talk to it</p>
        </div>
        <Status
          on={!!c?.assistantReady && !!c?.member}
          warn={!!c?.assistantReady && !c?.member}
          label={!c?.assistantReady ? "Off" : c.member ? "Ready" : "Locked"}
        />
      </div>
      {!c?.assistantReady ? (
        <p className="set-note">Waiting on its API key. Once it&apos;s added to the app on Vercel, the assistant switches on.</p>
      ) : c.member ? (
        <p className="set-note">This device is family, so the assistant is unlocked here.</p>
      ) : (
        <>
          <p className="set-note">Enter the family PIN once on this device to unlock the assistant. Linking Sonos unlocks it too.</p>
          <form
            className="set-actions"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await h.a.submitPin(pin);
              setBad(!ok);
              if (ok) h.a.notify("Unlocked. The assistant is ready.");
            }}
          >
            <input
              className="mono"
              style={{ height: 40, padding: "0 12px", borderRadius: 12, border: "1px solid var(--line2)", background: "rgba(15,20,25,.45)" }}
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              aria-label="Family PIN"
            />
            <button className="btn gold sm" type="submit" disabled={!pin}>
              Unlock
            </button>
          </form>
          {bad ? <p className="set-note" style={{ color: "#fca5a5" }}>That PIN didn&apos;t match.</p> : null}
        </>
      )}
    </section>
  );
}

/* ---------- Home screen ---------- */

function HomeScreenSection() {
  return (
    <section className="set">
      <h3>
        <Icon name="share" />
        Put it on the home screen
      </h3>
      <ol className="steps">
        <li>
          <b>iPhone or iPad:</b> open compassclassics.com in Safari, tap Share, then Add to Home Screen. It opens full screen with the
          compass icon, like any other app.
        </li>
        <li>
          <b>PC:</b> in Edge or Chrome, click the install icon at the right end of the address bar, or the menu, then Apps, then Install.
        </li>
      </ol>
    </section>
  );
}
