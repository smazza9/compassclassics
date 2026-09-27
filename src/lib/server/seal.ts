import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/*
 * Encrypted, tamper-proof cookie values (AES-256-GCM). The Sonos sign-in and
 * the "this device is family" pass both live in cookies sealed this way, so
 * there is no database and nothing to leak but ciphertext.
 */

function key(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is not set");
  return createHash("sha256").update("compass-classics:" + s).digest();
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url");
}

export function unseal<T>(sealed: string | undefined | null): T | null {
  if (!sealed) return null;
  try {
    const b = Buffer.from(sealed, "base64url");
    const d = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function safeEqual(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

export const hasSecret = () => !!process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16;
