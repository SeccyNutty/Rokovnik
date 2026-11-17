import { createHash, createPublicKey, createVerify, randomBytes, type JsonWebKey } from "node:crypto";
import { sign, safeEqual } from "./tokens";

/**
 * Prijava putem Googlea (OpenID Connect, tok s autorizacijskim kodom i PKCE-om), bez vanjskih
 * biblioteka. Provjerava se: stanje (state) protiv krivotvorenja zahtjeva, nonce protiv ponovne
 * upotrebe tokena, potpis tokena Googleovim javnim ključem, izdavatelj, primatelj, rok i to da
 * je e-mail adresa potvrđena.
 */
type Endpoints = { issuer: string[]; authorize: string; token: string; jwks: string };

const GOOGLE: Endpoints = {
  issuer: ["https://accounts.google.com", "accounts.google.com"],
  authorize: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  jwks: "https://www.googleapis.com/oauth2/v3/certs",
};

/**
 * Samo za automatske testove: lažni izdavatelj na lokalnoj adresi. Na pravom hostingu se
 * ne može uključiti, čak ni pogrešnom varijablom.
 */
function endpoints(): Endpoints {
  const test = process.env.OIDC_TEST_ISSUER;
  const hosted = process.env.NETLIFY || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (test && !hosted && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(test)) {
    return { issuer: [test], authorize: `${test}/authorize`, token: `${test}/token`, jwks: `${test}/jwks` };
  }
  return GOOGLE;
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

const b64url = (b: Buffer) => b.toString("base64url");

export type LoginIntent = { next: string; action: string };
type StatePayload = LoginIntent & { state: string; nonce: string; verifier: string; exp: number };

export const STATE_COOKIE = "rokovnik_prijava";

/** Početak prijave: adresa na koju šaljemo korisnika i vrijednost kolačića koja prati taj pokušaj. */
export function beginLogin(redirectUri: string, intent: LoginIntent, now = Date.now()): { url: string; cookie: string } {
  const payload: StatePayload = {
    ...intent,
    state: b64url(randomBytes(24)),
    nonce: b64url(randomBytes(24)),
    verifier: b64url(randomBytes(48)),
    exp: now + 10 * 60_000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: payload.state,
    nonce: payload.nonce,
    code_challenge: b64url(createHash("sha256").update(payload.verifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { url: `${endpoints().authorize}?${q}`, cookie: `${body}.${sign(`prijava:${body}`)}` };
}

function readState(cookie: string | undefined, now = Date.now()): StatePayload | null {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = cookie.slice(0, dot);
  if (!safeEqual(cookie.slice(dot + 1), sign(`prijava:${body}`))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    return p.exp > now ? p : null;
  } catch {
    return null;
  }
}

type Jwk = JsonWebKey & { kid?: string };
let jwksCache: { at: number; url: string; keys: Jwk[] } | null = null;

async function signingKeys(force = false): Promise<Jwk[]> {
  const url = endpoints().jwks;
  if (!force && jwksCache && jwksCache.url === url && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Javni ključevi nisu dohvaćeni (${res.status}).`);
  const keys = ((await res.json()) as { keys?: Jwk[] }).keys ?? [];
  jwksCache = { at: Date.now(), url, keys };
  return keys;
}

export type GoogleIdentity = { sub: string; email: string; name: string };

async function verifyIdToken(idToken: string, nonce: string, now = Date.now()): Promise<GoogleIdentity> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Token nije ispravnog oblika.");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { alg?: string; kid?: string };
  if (header.alg !== "RS256") throw new Error("Nepodržan algoritam potpisa.");
  let key = (await signingKeys()).find((k) => k.kid === header.kid);
  if (!key) key = (await signingKeys(true)).find((k) => k.kid === header.kid);
  if (!key) throw new Error("Nepoznat ključ potpisa.");
  const ok = createVerify("RSA-SHA256")
    .update(`${parts[0]}.${parts[1]}`)
    .verify(createPublicKey({ key, format: "jwk" }), Buffer.from(parts[2], "base64url"));
  if (!ok) throw new Error("Potpis tokena nije ispravan.");

  const c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
    iss?: string; aud?: string | string[]; exp?: number; nonce?: string; sub?: string; email?: string; email_verified?: boolean | string; name?: string;
  };
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!c.iss || !endpoints().issuer.includes(c.iss)) throw new Error("Token nije izdao Google.");
  if (!aud.includes(process.env.GOOGLE_CLIENT_ID)) throw new Error("Token nije namijenjen ovoj aplikaciji.");
  if (!c.exp || c.exp * 1000 < now - 60_000) throw new Error("Token je istekao.");
  if (!c.nonce || !safeEqual(c.nonce, nonce)) throw new Error("Token ne pripada ovom pokušaju prijave.");
  if (!c.sub || !c.email) throw new Error("Token ne sadrži identitet.");
  if (c.email_verified !== true && c.email_verified !== "true") throw new Error("E-mail adresa Google računa nije potvrđena.");
  return { sub: c.sub, email: c.email.trim().toLowerCase(), name: (c.name ?? "").trim().slice(0, 120) };
}

/** Završetak prijave: provjera stanja, zamjena koda za token i provjera tokena. */
export async function completeLogin(opts: {
  redirectUri: string;
  stateCookie: string | undefined;
  state: string | null;
  code: string | null;
}): Promise<{ identity: GoogleIdentity; intent: LoginIntent }> {
  const saved = readState(opts.stateCookie);
  if (!saved || !opts.state || !safeEqual(saved.state, opts.state)) throw new Error("Pokušaj prijave je istekao ili nije započet na ovoj stranici.");
  if (!opts.code) throw new Error("Google nije vratio kod za prijavu.");
  const res = await fetch(endpoints().token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Zamjena koda nije uspjela (${res.status}).`);
  const token = (await res.json()) as { id_token?: string };
  if (!token.id_token) throw new Error("Odgovor ne sadrži token identiteta.");
  return { identity: await verifyIdToken(token.id_token, saved.nonce), intent: { next: saved.next, action: saved.action } };
}
