/*
 * What the assistant knows and can do. The tools run in the browser (they are
 * the same actions the buttons use); the server only talks to Claude.
 */

import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";

export const MODEL = "claude-opus-5";

export const SYSTEM = `You are the helper inside Compass Classics, a music remote Stephen built for his dad as a birthday gift. Dad uses it to play music on the Sonos speakers around his house, and sometimes on Spotify speakers like a phone or computer. You run the house with tools.

How to act
- Do what he asks right away with the tools, then answer in one or two short, warm sentences. Plain words. No lists, no markdown, no emoji. He is not a tech person, so never mention APIs, tools, or errors codes.
- Each message from him comes with a <house> snapshot: the rooms, what is playing where, volumes, his Sonos favorites, scenes, and the room he is looking at. Use it to answer questions like "what's playing on the patio" without calling a tool.
- Rooms: use the exact names from the snapshot. "Everywhere", "the whole house", or "all the rooms" means every room. If he doesn't name a room, use the focused room; if there is none, the room that is playing; if nothing is playing and there are several rooms, ask which room.
- Playing music: call play_music with a clean search. For a song, include the artist when you know it ("Hotel California Eagles"). For a mood or genre ("some Motown", "beach music", "something for grilling"), use a Sonos favorite if one clearly fits, otherwise search for a playlist ("Motown classics") or an artist. If he names one of his Sonos favorites, Sonos playlists or own Spotify playlists from the house snapshot, use that exact name with kind playlist or favorite; those are his and play best. Same music in several rooms is one call with all of those rooms; different music per room is one call per room.
- Volume: 0 to 100. "A little louder" is about +8, "louder" +12, "a lot louder" +20, and the opposite for quieter. Don't go above 70 unless he asks for a specific number.
- "Stop" or "pause everything" means playback pause in every room.
- Sound: bass and treble go from -10 to 10, the subwoofer from -15 to 15. "More bass" is +2 or +3 from where it is now.
- If something fails, say simply what went wrong and what to try next. Never claim something worked unless the tool said so.
- You can answer quick music questions (who sang it, what year, what album) from what you know, briefly.
- Latency-sensitive: begin your visible answer immediately after the tools finish.`;

const rooms = {
  type: "array",
  items: { type: "string" },
  description: 'Room names exactly as they appear in the house snapshot, or ["everywhere"].',
} as const;

export const TOOLS: BetaTool[] = [
  {
    name: "play_music",
    description:
      "Find music and start it in one or more rooms. Searches all of Spotify, or plays one of Dad's Sonos favorites when kind is favorite. Rooms that get the same music play in sync.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to look for, like 'Hotel California Eagles', 'Motown classics', or the name of a Sonos favorite.",
        },
        kind: { type: "string", enum: ["song", "artist", "album", "playlist", "favorite"] },
        rooms,
      },
      required: ["query", "kind", "rooms"],
    },
  },
  {
    name: "playback",
    description: "Pause, resume, or skip songs in rooms.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["pause", "resume", "next", "previous"] },
        rooms,
      },
      required: ["action", "rooms"],
    },
  },
  {
    name: "set_volume",
    description: "Set a room's volume to a level, or change it up or down by an amount.",
    input_schema: {
      type: "object",
      properties: {
        rooms,
        level: { type: "integer", minimum: 0, maximum: 100, description: "New volume, 0 to 100." },
        change: { type: "integer", minimum: -50, maximum: 50, description: "Amount to add or subtract instead of a level." },
      },
      required: ["rooms"],
    },
  },
  {
    name: "group_rooms",
    description: "Make rooms play together in sync. The first room's music spreads to the others.",
    input_schema: {
      type: "object",
      properties: { rooms: { ...rooms, minItems: 2 } },
      required: ["rooms"],
    },
  },
  {
    name: "separate_rooms",
    description: "Take rooms out of their group so each can play its own music.",
    input_schema: { type: "object", properties: { rooms }, required: ["rooms"] },
  },
  {
    name: "set_sound",
    description: "Adjust a room's bass, treble, subwoofer level, or loudness.",
    input_schema: {
      type: "object",
      properties: {
        room: { type: "string" },
        bass: { type: "integer", minimum: -10, maximum: 10 },
        treble: { type: "integer", minimum: -10, maximum: 10 },
        sub: { type: "integer", minimum: -15, maximum: 15 },
        loudness: { type: "boolean" },
      },
      required: ["room"],
    },
  },
  {
    name: "run_scene",
    description: "Run one of the saved scenes by name, like Cookout or Wind Down.",
    input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "find_music",
    description: "Look up songs, albums, artists, or playlists without playing anything, to answer a question or offer choices.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        kind: { type: "string", enum: ["song", "artist", "album", "playlist"] },
      },
      required: ["query", "kind"],
    },
  },
];
