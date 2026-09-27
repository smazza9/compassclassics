# Compass Classics home hub

## What it's for

The Compass Classics app controls the Sonos speakers through Sonos's cloud service. The cloud can't do two things:

- **EQ**: bass, treble, loudness, sub level, night mode and speech enhancement.
- **Play any Spotify song, album or playlist** in a room. The cloud can only play Sonos Favorites.

Every Sonos speaker can do both of these over the home network. The hub is a small program that runs on a computer in the house and passes those requests from the app to the speakers. The rest of the app works without it. Only these extra controls need the hub.

## Run it on Windows

1. Install **Node.js LTS** from <https://nodejs.org> and accept the defaults.
2. Double-click **`start-hub.cmd`** in this folder. You can also open a terminal in the repo and run `node hub/compass-hub.mjs`.
3. The first time it runs, Windows may ask whether Node.js can use the network. Tick **Private networks** and click **Allow**.
   **If you skip this, the hub won't find any speakers.** To fix it later, open Start, search for *Allow an app through Windows Firewall*, click *Change settings*, tick **Private** next to *Node.js JavaScript Runtime*, then click OK. Then restart the hub.
4. The window shows a banner with the hub's address, its **key**, and how many Sonos players it found. Leave the window open. Closing it stops the hub.

The key is created on the first run and saved in `.compass-hub.json` in your user folder (`C:\Users\<you>\` on Windows, `~` on a Pi). The hub reuses it every time, so you only enter it in the app once.

## Options

Add these after the command, for example `node hub/compass-hub.mjs --lan --port 5006`. They also work with `start-hub.cmd --tunnel`.

| Flag | What it does |
| --- | --- |
| `--port 5005` | Port to listen on. The default is 5005. |
| `--host 127.0.0.1` | Address to listen on. The default only accepts connections from this computer. |
| `--lan` | Listen on every network address (0.0.0.0), so other devices on the home network can connect. |
| `--mock` | Pretend house for testing. No speakers needed. |
| `--ip 192.168.1.50` | Check this speaker directly. Repeat for more. Use it when automatic discovery finds nothing. |
| `--key <key>` | Use this key for this run instead of the saved one. It isn't saved. |
| `--spotify-sn <n>` | Spotify account number inside Sonos. Normally detected automatically. |
| `--spotify-sid <n>` | Sonos's id for Spotify: 12 on current systems, 9 on some older ones. Normally detected. |
| `--origin <url>` | Allow another website to call the hub. Repeat for more. The app's own sites are already allowed. |
| `--tunnel` | Also start a Cloudflare quick tunnel so phones can connect (see below). |
| `--help` | List every option. |

## Try it without any Sonos (mock mode)

```
node hub/compass-hub.mjs --mock
```

This makes a pretend house with three rooms:

- Living Room: an Arc with a Sub
- Patio: a Move
- Garage: an Era 100 with a Sub

EQ and volume changes are remembered until you stop the hub. Play requests succeed and are logged, but nothing actually plays. For a quick check from a terminal, replace `YOUR_KEY` with the key from the banner:

```
curl http://127.0.0.1:5005/ping
curl -H "X-Hub-Key: YOUR_KEY" http://127.0.0.1:5005/rooms
```

## Using it from a phone

The app is served over **https**. Phones and browsers won't let an https page talk to a plain `http://192.168...` address; they block it as "mixed content". A browser on the same computer as the hub is the one exception, because `http://127.0.0.1:5005` is allowed. So the phone needs an **https** address for the hub. The easiest way to get one is a free Cloudflare quick tunnel:

1. Install cloudflared: `winget install --id Cloudflare.cloudflared`, then open a new terminal window.
2. Start the hub with the tunnel: `start-hub.cmd --tunnel`, or `node hub/compass-hub.mjs --tunnel`.
   You can also run this yourself in a second window: `cloudflared tunnel --url http://127.0.0.1:5005`
3. Copy the `https://....trycloudflare.com` address it prints.
4. In the app, open **Settings, Home hub**, paste that address and the hub key, and save.

A quick-tunnel address changes every time the tunnel restarts, so paste the new one when that happens. For an address that never changes, set up a named Cloudflare tunnel on a domain you own. The key is what keeps strangers out, so keep it private. If it ever leaks, delete `.compass-hub.json` and restart the hub to get a new key.

## Raspberry Pi (always on, at Dad's house)

1. Install Node.js LTS on the Pi, copy this `hub` folder to `/home/pi/compass-hub`, and run it once by hand to check it works: `node /home/pi/compass-hub/compass-hub.mjs`
2. Save the following as `/etc/systemd/system/compass-hub.service`. Check the node path with `which node`, and change `pi` if your username is different.

```ini
[Unit]
Description=Compass Classics home hub
Wants=network-online.target
After=network-online.target

[Service]
User=pi
WorkingDirectory=/home/pi/compass-hub
ExecStart=/usr/bin/node /home/pi/compass-hub/compass-hub.mjs --tunnel
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

3. Turn it on so it starts at every boot:

```
sudo systemctl daemon-reload
sudo systemctl enable --now compass-hub
journalctl -u compass-hub -f      # shows the key, rooms found and the tunnel address
```

Leave out `--tunnel` if you set up a permanent Cloudflare tunnel separately. The Pi has no Windows Firewall, so discovery usually just works there.

## If something isn't working

- **"0 players found".** First check the firewall step above. The computer also has to be on the same network as the speakers, not a guest Wi-Fi. If it still finds nothing, run it with a speaker's IP address: `--ip 192.168.1.50`. You'll find speaker IPs in the Sonos app under *About My System*, or in your router's device list.
- **Play fails with "Sonos refused the Spotify item".** Spotify has to be added in the Sonos app. If it is, the hub may have the wrong Spotify account number. Save any Spotify song to Sonos Favorites and restart the hub, which reads the number from there. You can also try `--spotify-sn 2`, then `3`, and so on.
- **"Port 5005 is already in use".** The hub is already running in another window. You can also pick another port with `--port 5006`.

## API (for the app)

Every response is JSON. Errors look like `{"error": "..."}`. Every route except `/ping` needs the header `X-Hub-Key: <key>`. Room ids are the same `RINCON_...` player ids the Sonos cloud API uses.

| Route | Body | Returns |
| --- | --- | --- |
| `GET /ping` | | `{ok, app, version, mock}` |
| `GET /status` | | `{ok, version, mock, players, lastScan, spotify}` |
| `GET /rooms` | | `{rooms: [{id, name, model, ip, coordinatorId, isCoordinator, memberIds, hasSub, isHomeTheater}]}` |
| `POST /rescan` | | `{rooms}`, after searching the network again |
| `GET /eq/:roomId` | | `{roomId, bass, treble, loudness, subGain, subEnabled, nightMode, dialogLevel}`. `null` means the room doesn't have that setting. |
| `POST /eq/:roomId` | any of those fields | the fresh EQ. Bass and treble go from -10 to 10, subGain from -15 to 15. Values out of range are clamped. |
| `POST /volume/:roomId` | `{volume: 0-100}` | `{roomId, volume}` |
| `POST /play/:roomId` | `{uri: "spotify:track:ID", mode: "replace" \| "next" \| "append"}` | `{ok, roomId, coordinatorId, uri, mode}` |
| `GET /spotify` | | `{sid, sn, source: "favorites" \| "flag" \| "default"}` |

The rate limit is 240 requests per minute per device, so debounce sliders in the app.
