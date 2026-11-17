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

const REQUEST_TOKEN_DAYS = 30;

/** Token u poveznici "Potvrdi zajednicu" iz maila administratoru. Vrijedi 30 dana. */
export function requestToken(requestId: string, now = Date.now()): string {
  const exp = now + REQUEST_TOKEN_DAYS * 24 * 3600_000;
  return `${requestId}.${exp}.${sign(`request:${requestId}:${exp}`)}`;
}

export function verifyRequestToken(token: string, now = Date.now()): string | null {
  const [id, exp, sig] = token.split(".");
  if (!id || !exp || !sig || !/^[0-9a-f-]{36}$/i.test(id) || !/^\d+$/.test(exp)) return null;
  if (Number(exp) < now) return null;
  return safeEqual(sig, sign(`request:${id}:${exp}`)) ? id : null;
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
