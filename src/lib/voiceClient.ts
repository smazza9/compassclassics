/*
 * The browser side of the voice assistant: a WebRTC call to OpenAI's Realtime
 * model. Dad's voice goes up, the model's voice comes back, and tool calls
 * arrive on a data channel. Tools run here, against the same house actions the
 * buttons use, and their results go back so the model can say what happened.
 */

import type { House } from "./house";
import { houseSnapshot, runTool, type Input } from "./assistantClient";

export type VoiceStatus = "idle" | "connecting" | "listening" | "speaking" | "working" | "error";

export interface VoiceTurn {
  id: string;
  role: "user" | "assistant" | "action";
  text: string;
  error?: boolean;
}

interface Hooks {
  getHouse: () => House;
  onStatus: (s: VoiceStatus) => void;
  onTurns: (turns: VoiceTurn[]) => void;
  onError: (msg: string | null) => void;
  onLocked: () => void;
}

type Ev = Record<string, unknown> & { type?: string };

const uid = () => Math.random().toString(36).slice(2, 10);

/** A cough, a breath, music in the room: not a request. */
function isNoise(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[^a-z' ]/g, "");
  if (t.length < 2) return true;
  return /^(uh+|um+|hm+|mm+|ah+|oh+|huh|so|okay|ok)$/.test(t);
}

export class VoiceSession {
  private h: Hooks;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private status: VoiceStatus = "idle";
  private turns: VoiceTurn[] = [];
  private assistantItems = new Map<string, string>();
  private started = new Set<string>();
  private outputs = new Map<string, string>();
  private running = 0;
  private batches: string[][] = [];
  private responseActive = false;
  private wantCreate = false;
  private queued: string[] = [];
  withMic = false;

  constructor(h: Hooks) {
    this.h = h;
  }

  get connected() {
    return this.status !== "idle" && this.status !== "error";
  }

  private setStatus(s: VoiceStatus) {
    this.status = s;
    this.h.onStatus(s);
  }

  private addTurn(t: Omit<VoiceTurn, "id">): string {
    const id = uid();
    this.turns = [...this.turns, { ...t, id }].slice(-60);
    this.h.onTurns(this.turns);
    return id;
  }

  private patchTurn(id: string, text: string) {
    this.turns = this.turns.map((t) => (t.id === id ? { ...t, text } : t));
    this.h.onTurns(this.turns);
  }

  clear() {
    this.turns = [];
    this.h.onTurns(this.turns);
  }

  private send(ev: Ev): boolean {
    if (this.dc?.readyState !== "open") return false;
    try {
      this.dc.send(JSON.stringify(ev));
      return true;
    } catch {
      return false;
    }
  }

  /** Start the call. Must be called from a tap so iOS lets the voice play. */
  async start(withMic: boolean): Promise<void> {
    if (this.connected) return;
    this.withMic = withMic;
    this.h.onError(null);
    this.setStatus("connecting");
    this.started.clear();
    this.outputs.clear();
    this.batches = [];
    this.responseActive = false;
    this.wantCreate = false;
    this.running = 0;
    try {
      if (typeof RTCPeerConnection === "undefined") throw new Error("This browser can't do live audio. Use Safari, Chrome or Edge.");
      if (!this.audio) {
        this.audio = new Audio();
        this.audio.autoplay = true;
      }
      let mic: MediaStream | null = null;
      if (withMic) {
        try {
          mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        } catch {
          this.h.onError("The microphone is blocked. Allow it for this site in the browser settings, or type below and it will answer out loud.");
          mic = null;
        }
      }
      this.mic = mic;
      const pc = new RTCPeerConnection();
      this.pc = pc;
      pc.ontrack = (e) => {
        if (this.audio) {
          this.audio.srcObject = e.streams[0];
          void this.audio.play().catch(() => {});
        }
      };
      if (mic) mic.getTracks().forEach((t) => pc.addTrack(t, mic));
      else pc.addTransceiver("audio", { direction: "sendrecv" });
      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.onmessage = (e) => {
        try {
          this.onEvent(JSON.parse(String(e.data)) as Ev);
        } catch {
          /* not JSON */
        }
      };
      dc.onopen = () => {
        this.setStatus("listening");
        const q = this.queued;
        this.queued = [];
        for (const t of q) this.sendText(t);
      };
      dc.onclose = () => {
        if (this.dc === dc) this.stop();
      };
      pc.onconnectionstatechange = () => {
        if (this.pc !== pc) return;
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          this.h.onError("The voice connection dropped. Tap Talk to start again.");
          this.stop();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const ua = navigator.userAgent;
      const phone = /iPhone|Android.+Mobile/.test(ua);
      const res = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: houseSnapshot(this.h.getHouse()), mic: phone ? "near" : "far" }),
      });
      const sess = (await res.json().catch(() => null)) as { client_secret?: string; error?: string } | null;
      if (res.status === 401 && sess?.error === "locked") {
        this.stop();
        this.h.onLocked();
        return;
      }
      if (!res.ok || !sess?.client_secret) throw new Error(sess?.error || "Couldn't start the voice assistant.");
      if (this.pc !== pc) return;

      const headers = { Authorization: "Bearer " + sess.client_secret };
      let sdp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/sdp" },
        body: offer.sdp ?? "",
      });
      if (!sdp.ok) {
        const fd = new FormData();
        fd.append("sdp", offer.sdp ?? "");
        sdp = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", headers, body: fd });
      }
      if (!sdp.ok) throw new Error("The voice service refused the call (" + sdp.status + ").");
      const answer = await sdp.text();
      if (this.pc !== pc) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (e) {
      this.h.onError(e instanceof Error ? e.message : "Couldn't start the voice assistant.");
      this.stop("error");
    }
  }

  stop(final: VoiceStatus = "idle") {
    try {
      this.dc?.close();
    } catch {
      /* already closed */
    }
    try {
      this.pc?.close();
    } catch {
      /* already closed */
    }
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.dc = null;
    this.pc = null;
    if (this.audio) this.audio.srcObject = null;
    this.setStatus(final);
  }

  /** Typed request: it answers out loud. Starts a quiet call first if needed. */
  sendText(text: string) {
    const t = text.trim();
    if (!t) return;
    if (this.dc?.readyState !== "open") {
      this.queued.push(t);
      if (!this.connected) void this.start(false);
      return;
    }
    this.addTurn({ role: "user", text: t });
    if (this.responseActive) this.send({ type: "response.cancel" });
    this.send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: t }] } });
    this.requestResponse();
  }

  private requestResponse() {
    if (this.responseActive || this.batches.length || this.running) {
      this.wantCreate = true;
      return;
    }
    this.wantCreate = false;
    this.responseActive = true;
    if (!this.send({ type: "response.create", event_id: "cc_" + uid() })) this.responseActive = false;
  }

  private async runCall(callId: string, name: string, args: string) {
    if (this.started.has(callId)) return;
    this.started.add(callId);
    this.running += 1;
    this.setStatus("working");
    let input: Input = {};
    try {
      input = JSON.parse(args || "{}") as Input;
    } catch {
      input = {};
    }
    let out: string;
    if (name === "get_house") {
      out = houseSnapshot(this.h.getHouse());
    } else {
      const r = await runTool(this.h.getHouse(), name, input);
      if (r.action) this.addTurn({ role: "action", text: r.action });
      else if (r.error) this.addTurn({ role: "action", text: r.text, error: true });
      out = r.text;
    }
    this.outputs.set(callId, out);
    this.running -= 1;
    this.flush();
  }

  /** Send back every finished batch of tool results, then ask for one answer. */
  private flush() {
    let sent = false;
    const remaining: string[][] = [];
    for (const batch of this.batches) {
      if (!batch.every((id) => this.outputs.has(id))) {
        remaining.push(batch);
        continue;
      }
      for (const id of batch) {
        this.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: id, output: this.outputs.get(id) } });
        this.outputs.delete(id);
      }
      sent = true;
    }
    this.batches = remaining;
    if (sent || this.wantCreate) this.requestResponse();
  }

  private onEvent(ev: Ev) {
    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        if (this.running === 0) this.setStatus("listening");
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const text = String(ev.transcript ?? "").trim();
        if (!isNoise(text)) this.addTurn({ role: "user", text });
        break;
      }
      case "response.created":
        this.responseActive = true;
        if (this.running === 0) this.setStatus("speaking");
        break;
      case "response.output_audio_transcript.delta": {
        const key = String(ev.item_id ?? ev.response_id ?? "x");
        const delta = String(ev.delta ?? "");
        const id = this.assistantItems.get(key);
        if (id) {
          const cur = this.turns.find((t) => t.id === id);
          this.patchTurn(id, (cur?.text ?? "") + delta);
        } else this.assistantItems.set(key, this.addTurn({ role: "assistant", text: delta }));
        break;
      }
      case "response.output_audio_transcript.done":
      case "response.output_text.done": {
        const key = String(ev.item_id ?? ev.response_id ?? "x");
        const full = String(ev.transcript ?? ev.text ?? "");
        const id = this.assistantItems.get(key);
        if (id) this.patchTurn(id, full);
        else if (full.trim()) this.assistantItems.set(key, this.addTurn({ role: "assistant", text: full }));
        break;
      }
      case "response.function_call_arguments.done":
        if (ev.call_id && ev.name) void this.runCall(String(ev.call_id), String(ev.name), String(ev.arguments ?? "{}"));
        break;
      case "response.done": {
        this.responseActive = false;
        const resp = ev.response as { output?: { type?: string; call_id?: string; name?: string; arguments?: string }[] } | undefined;
        const calls = (resp?.output ?? []).filter((o) => o?.type === "function_call" && o.call_id);
        if (calls.length) {
          this.batches.push(calls.map((c) => String(c.call_id)));
          for (const c of calls) void this.runCall(String(c.call_id), String(c.name ?? ""), String(c.arguments ?? "{}"));
          this.flush();
        } else {
          if (this.running === 0) this.setStatus("listening");
          if (this.wantCreate) this.requestResponse();
        }
        break;
      }
      case "error": {
        const msg = String((ev.error as { message?: string } | undefined)?.message ?? "The voice assistant hit a snag.");
        if (/active response|already has an active/i.test(msg)) {
          this.wantCreate = true;
          break;
        }
        if (/data channel limit/i.test(msg)) break;
        this.h.onError(msg);
        break;
      }
      default:
        break;
    }
  }
}
