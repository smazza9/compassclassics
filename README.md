# Compass Classics

Every room, its own music. A music remote for Dad's Sonos: rooms, grouping,
scenes, every song on Spotify, an assistant you can talk to, and real EQ.

Live at **https://compassclassics.com**. A personal family app, separate from
every client project.

## How it fits together

- **Rooms and grouping** use the official Sonos cloud API
  (`/api/sonos/*`), so the app works from anywhere. The Sonos sign in is kept
  in an encrypted cookie on each device. There is no database.
- **Search and Spotify speakers** use Spotify straight from the browser
  (PKCE sign in, no secret). Spotify speakers show up as their own rooms:
  phones, computers, TVs, receivers, and "This device".
- **Any song on Sonos** works in one of two ways:
  1. Room playlists. Each room gets a Spotify playlist called
     "Compass Classics · Room", added once to My Sonos. The app refills the
     playlist, then starts that favorite in the room.
  2. The home hub (`/hub`), a small program on a computer at the house, which
     starts Spotify songs on Sonos over the local network.
- **EQ** (bass, treble, sub, loudness, night sound) needs the home hub. Sonos
  only allows EQ changes from the local network.
- **Assistant** (`/api/assistant`) is Claude (`claude-opus-5`) with tools that
  run in the browser, so a spoken request and a tap do the same thing. Refusal
  fallback is on. The assistant only works on "family" devices, meaning ones
  that linked Sonos or entered the PIN.

## Environment (Vercel)

| Name | What |
| --- | --- |
| `SESSION_SECRET` | Long random string. It seals the cookies. |
| `APP_PIN` | Family PIN that unlocks the assistant on a device. |
| `SONOS_CLIENT_ID`, `SONOS_CLIENT_SECRET` | From the Sonos control integration. The redirect is `https://compassclassics.com/api/sonos/callback`. |
| `SPOTIFY_CLIENT_ID` | From the Spotify dashboard. Redirects: `https://compassclassics.com/spotify/callback` and `http://127.0.0.1:3000/spotify/callback`. |
| `ANTHROPIC_API_KEY` | A key used only by this app. |
| `APP_URL` | Optional. Defaults to the request origin. |

## Local

```bash
npm install
npm run dev          # http://127.0.0.1:3000 (Spotify won't redirect to "localhost")
npm run hub:mock     # home hub with pretend speakers
npm run hub          # the real home hub, on the same Wi-Fi as the Sonos speakers
```
