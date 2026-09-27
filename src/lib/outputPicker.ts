/*
 * "Choose speaker": on iPhone, iPad and Mac, Safari can open Apple's own
 * speaker list (Bluetooth speakers, AirPods, AirPlay speakers), the same one
 * as Control Center. No website can pair Bluetooth itself; this lets Dad
 * switch to a speaker he has already paired without leaving the app.
 */

type PickerMedia = HTMLMediaElement & { webkitShowPlaybackTargetPicker?: () => void };

let el: PickerMedia | null = null;

export function pickerSupported(): boolean {
  return typeof window !== "undefined" && "webkitShowPlaybackTargetPicker" in HTMLMediaElement.prototype;
}

/** A tenth of a second of silence as a WAV blob, so the picker has something to route. */
function silentWav(): string {
  const rate = 8000;
  const n = rate / 10;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const s = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  s(8, "WAVE");
  s(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  s(36, "data");
  v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128); // 8-bit silence
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function media(): PickerMedia {
  if (!el) {
    el = document.createElement("audio") as PickerMedia;
    el.setAttribute("x-webkit-airplay", "allow");
    el.preload = "auto";
    el.src = silentWav();
    el.style.display = "none";
    document.body.appendChild(el);
  }
  return el;
}

/** Open Apple's speaker list. Call from a tap. */
export async function showSpeakerPicker(): Promise<boolean> {
  if (!pickerSupported()) return false;
  const m = media();
  try {
    await m.play();
  } catch {
    /* the picker still opens without playback on most versions */
  }
  m.webkitShowPlaybackTargetPicker?.();
  return true;
}
