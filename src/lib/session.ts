import { sign, safeEqual } from "./tokens";

/**
 * Prijava korisnika: potpisani kolačić (HMAC) s osnovnim podacima. Kolačić služi za prikaz
 * (ime u zaglavlju) i kao dokaz identiteta; ovlasti se pri svakoj osjetljivoj radnji
 * ponovno čitaju iz baze (vidi auth.ts), pa oduzeta uloga prestaje vrijediti odmah.
 */
export const USER_COOKIE = "rokovnik_sesija";
/** Nije tajna: samo govori skriptama u pregledniku da je netko prijavljen (httpOnly kolačić ne vide). */
export const HINT_COOKIE = "rokovnik_prijavljen";
export const USER_SESSION_DAYS = 30;
export const USER_SESSION_MAX_AGE = USER_SESSION_DAYS * 24 * 3600;

export type SessionUser = { uid: string; email: string; name: string; epoch: number; exp: number };

export function createUserSession(u: { id: string; email: string; name: string; sessionEpoch: number }, now = Date.now()): string {
  const payload: SessionUser = { uid: u.id, email: u.email, name: u.name, epoch: u.sessionEpoch, exp: now + USER_SESSION_MAX_AGE * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(`korisnik:${body}`)}`;
}

export function readUserSession(value: string | undefined, now = Date.now()): SessionUser | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  if (!safeEqual(value.slice(dot + 1), sign(`korisnik:${body}`))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionUser;
    if (typeof p.uid !== "string" || typeof p.email !== "string" || typeof p.exp !== "number" || p.exp < now) return null;
    return p;
  } catch {
    return null;
  }
}

/** Dopušteno odredište nakon prijave: samo putanja unutar ove stranice (bez otvorenog preusmjeravanja). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) return "/";
  if (next.startsWith("/api/")) return "/";
  return next.slice(0, 500);
}
