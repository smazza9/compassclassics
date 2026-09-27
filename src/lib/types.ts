/* Shared shapes for the house: zones (what a card shows), rooms, and things to play. */

export type ZoneKind = "demo" | "sonos" | "spotify";

export interface NowTrack {
  title: string;
  artist: string;
  album?: string;
  /** Image URL for real music. */
  art?: string | null;
  /** Generative cover key for the example favorites. */
  artKey?: string;
  durationMs?: number | null;
  /** Radio and other streams with no end. */
  live?: boolean;
  /** Position in the example playlist, for jumping to it. */
  index?: number;
}

export interface MemberVolume {
  roomId: string;
  name: string;
  volume: number;
  muted?: boolean;
}

/** One card on the home screen: a room, a group of rooms, or a Spotify speaker. */
export interface Zone {
  key: string;
  kind: ZoneKind;
  /** Group id (Sonos), leader room id (demo), or device id (Spotify). */
  id: string;
  name: string;
  sub: string;
  /** Member room ids, the leader first. */
  roomIds: string[];
  playing: boolean;
  track: NowTrack | null;
  /** Where the music comes from, "Classic Rock Drive · Spotify playlist". */
  source: string | null;
  positionMs: number | null;
  /** Date.now() when positionMs was read, so the bar can keep moving between polls. */
  positionAt: number;
  canSkip: boolean;
  canSkipBack: boolean;
  members: MemberVolume[];
  upNext: NowTrack[];
  speakers: { name: string; room: string }[];
  glowSeed: string;
  accountId?: string;
}

/** A room you can send music to. */
export interface RoomRef {
  id: string;
  name: string;
  kind: ZoneKind;
  zoneKey: string;
  status: string;
}

export type SpotifyKind = "track" | "album" | "playlist" | "artist";

export type PlayItem =
  | { type: "demo"; favId: string; start?: number; title: string; subtitle: string }
  | { type: "sonos-favorite"; id: string; title: string; subtitle: string; art?: string | null }
  | { type: "sonos-playlist"; id: string; title: string; subtitle: string }
  | {
      type: "spotify";
      kind: SpotifyKind;
      uri: string;
      id: string;
      title: string;
      subtitle: string;
      art?: string | null;
      artistName?: string;
      artistId?: string;
    };

export interface EqState {
  bass: number;
  treble: number;
  loudness: boolean;
  subGain: number | null;
  subEnabled: boolean | null;
  nightMode: boolean | null;
  dialogLevel: boolean | null;
}

/* ---------- Sonos cloud snapshot (from /api/sonos/state) ---------- */

export interface SonosTrack {
  name?: string;
  type?: string;
  imageUrl?: string;
  durationMillis?: number;
  artist?: { name?: string };
  album?: { name?: string };
  service?: { name?: string };
}

export interface SonosGroup {
  id: string;
  name: string;
  coordinatorId: string;
  playbackState?: string;
  playerIds: string[];
}

export interface SonosPlayer {
  id: string;
  name: string;
  icon?: string;
  deviceIds?: string[];
  capabilities?: string[];
}

export interface SonosPlayback {
  playbackState?: string;
  positionMillis?: number;
  playModes?: { repeat?: boolean; repeatOne?: boolean; shuffle?: boolean; crossfade?: boolean };
  availablePlaybackActions?: {
    canSkip?: boolean;
    canSkipBack?: boolean;
    canSeek?: boolean;
    canPause?: boolean;
    canShuffle?: boolean;
    canRepeat?: boolean;
  };
}

export interface SonosMetadata {
  container?: {
    name?: string;
    type?: string;
    imageUrl?: string;
    service?: { name?: string };
  };
  currentItem?: { track?: SonosTrack };
  nextItem?: { track?: SonosTrack };
  streamInfo?: string;
}

export interface SonosVolume {
  volume: number;
  muted: boolean;
  fixed?: boolean;
}

export interface SonosSnapshot {
  householdId: string;
  households: { id: string; name?: string }[];
  groups: SonosGroup[];
  players: SonosPlayer[];
  playback: Record<string, SonosPlayback | null>;
  metadata: Record<string, SonosMetadata | null>;
  playerVolume: Record<string, SonosVolume | null>;
  groupVolume: Record<string, SonosVolume | null>;
  /** Volumes were fetched this time (they're only asked for every few polls). */
  volumes?: boolean;
  /** Sonos rate-limited part of this snapshot; back off for a bit. */
  limited?: boolean;
  at: number;
}

export interface SonosFavorite {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  service?: { name?: string; id?: string };
}

export interface SonosPlaylist {
  id: string;
  name: string;
  type?: string;
  trackCount?: number;
}

/* ---------- App config (from /api/config) ---------- */

export interface AppConfig {
  sonosReady: boolean;
  sonosLinked: boolean;
  assistantReady: boolean;
  /** The talking assistant (OpenAI Realtime) has its key. */
  voiceReady?: boolean;
  spotifyClientId: string | null;
  member: boolean;
  pinSet: boolean;
}
