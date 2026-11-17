// Lažni Google (OpenID Connect) za e2e testove. Radi samo na 127.0.0.1 i aplikacija ga prihvaća
// samo izvan pravog hostinga (vidi src/lib/google.ts). Provjerava PKCE kao pravi Google.
//
//   POST /sljedeci  {"sub","email","name"}   identitet koji će dobiti sljedeća prijava
//   GET  /authorize                          odmah vraća korisnika aplikaciji s kodom
//   POST /token                              kod + code_verifier → potpisani id_token
//   GET  /jwks                               javni ključ
import { createHash, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.OIDC_PORT || 3299);
const ISSUER = `http://127.0.0.1:${PORT}`;
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "e2e-kljuc", alg: "RS256", use: "sig" };
const codes = new Map();
let next = { sub: "e2e-zadani", email: "korisnik@e2e.example", name: "Testni Korisnik" };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function idToken(claims) {
  const head = b64({ alg: "RS256", kid: jwk.kid, typ: "JWT" });
  const body = b64(claims);
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
}
const read = (req) => new Promise((resolve) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d)); });
const json = (res, status, obj) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };

createServer(async (req, res) => {
  const url = new URL(req.url, ISSUER);
  if (req.method === "POST" && url.pathname === "/sljedeci") {
    next = { ...next, ...JSON.parse(await read(req)) };
    return json(res, 200, { ok: true });
  }
  if (url.pathname === "/authorize") {
    const q = url.searchParams;
    if (q.get("code_challenge_method") !== "S256" || !q.get("code_challenge") || !q.get("nonce")) return json(res, 400, { error: "invalid_request" });
    const code = randomBytes(16).toString("hex");
    codes.set(code, { identity: next, nonce: q.get("nonce"), challenge: q.get("code_challenge"), client: q.get("client_id"), redirect: q.get("redirect_uri") });
    const back = new URL(q.get("redirect_uri"));
    back.searchParams.set("code", code);
    back.searchParams.set("state", q.get("state"));
    res.writeHead(302, { location: back.toString() });
    return res.end();
  }
  if (req.method === "POST" && url.pathname === "/token") {
    const p = new URLSearchParams(await read(req));
    const entry = codes.get(p.get("code"));
    codes.delete(p.get("code"));
    if (!entry) return json(res, 400, { error: "invalid_grant" });
    const challenge = createHash("sha256").update(p.get("code_verifier") || "").digest("base64url");
    if (challenge !== entry.challenge || p.get("redirect_uri") !== entry.redirect || p.get("client_id") !== entry.client) return json(res, 400, { error: "invalid_grant" });
    const now = Math.floor(Date.now() / 1000);
    const { sub, email, name, email_verified = true } = entry.identity;
    return json(res, 200, { id_token: idToken({ iss: ISSUER, aud: entry.client, sub, email, name, email_verified, nonce: entry.nonce, iat: now, exp: now + 600 }) });
  }
  if (url.pathname === "/jwks") return json(res, 200, { keys: [jwk] });
  json(res, 404, { error: "nema" });
}).listen(PORT, "127.0.0.1", () => console.log(`Lažni Google na ${ISSUER}`));
