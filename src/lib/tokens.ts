import { createHmac, timingSafeEqual } from "node:crypto";
import { appSecret } from "./config";

/** Potpisi za kolačić administratora i poveznice za potvrdu zahtjeva. */

export function sign(payload: string): string {
  return createHmac("sha256", appSecret()).update(payload).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Token u poveznici "Potvrdi zajednicu" iz maila administratoru. */
export function requestToken(requestId: string): string {
  return `${requestId}.${sign(`request:${requestId}`)}`;
}

export function verifyRequestToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return safeEqual(sig, sign(`request:${id}`)) ? id : null;
}

const SESSION_DAYS = 14;

export function createSessionValue(now = Date.now()): string {
  const exp = now + SESSION_DAYS * 24 * 3600_000;
  return `${exp}.${sign(`admin:${exp}`)}`;
}

export function verifySessionValue(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < now) return false;
  return safeEqual(sig, sign(`admin:${exp}`));
}

export const SESSION_COOKIE = "rokovnik_admin";
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 3600;
