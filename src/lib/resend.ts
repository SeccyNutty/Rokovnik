import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Resend: slanje obavijesti i primanje maila.
 * Primanje: Resend na webhook šalje samo metapodatke (email.received), a tijelo
 * i privitke dohvaćamo preko API-ja.
 */

const API = "https://api.resend.com";

function apiKey(): string {
  const k = process.env.RESEND_API_KEY;
  if (!k) throw new Error("RESEND_API_KEY nije postavljen.");
  return k;
}

export function canSendEmail(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const res = await fetch(`${API}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // onboarding@resend.dev radi bez vlastite domene, ali samo prema adresi vlasnika Resend računa.
      from: process.env.RESEND_FROM || "Rokovnik <onboarding@resend.dev>",
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend slanje ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/**
 * Provjera potpisa webhooka (Svix shema): potpisuje se "id.timestamp.tijelo",
 * HMAC-SHA256 ključem iza prefiksa "whsec_" (base64).
 */
export function verifySvixSignature(opts: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now?: number;
  toleranceSeconds?: number;
}): boolean {
  const { secret, id, timestamp, signature, body } = opts;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(now - ts) > (opts.toleranceSeconds ?? 300)) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    const given = Buffer.from(value, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

export type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  html: string | null;
  text: string | null;
  created_at: string;
  message_id: string | null;
  headers?: Record<string, string> | null;
  authentication?: { spf?: string; dkim?: string; dmarc?: string } | null;
  attachments?: { id: string; filename: string; content_type: string; size?: number }[];
};

export async function getReceivedEmail(id: string): Promise<ReceivedEmail> {
  const res = await fetch(`${API}/emails/receiving/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend dohvat maila ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as ReceivedEmail;
}

const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const USEFUL_TYPE = /^(application\/pdf|image\/(png|jpeg|gif|webp))$/;

/** Plakati i PDF-ovi iz maila, za čitanje u AI izvlačenju. Najviše 3 privitka do 4 MB. */
export async function loadReceivedAttachments(
  emailId: string,
): Promise<{ filename: string; contentType: string; dataBase64: string }[]> {
  const res = await fetch(`${API}/emails/receiving/${encodeURIComponent(emailId)}/attachments`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  const list = (await res.json()) as {
    data?: { filename: string; content_type: string; size?: number; download_url?: string }[];
  };
  const out: { filename: string; contentType: string; dataBase64: string }[] = [];
  for (const a of list.data ?? []) {
    if (out.length >= MAX_ATTACHMENTS) break;
    if (!a.download_url || !USEFUL_TYPE.test(a.content_type)) continue;
    if (a.size && a.size > MAX_ATTACHMENT_BYTES) continue;
    const file = await fetch(a.download_url, { signal: AbortSignal.timeout(20_000) });
    if (!file.ok) continue;
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_ATTACHMENT_BYTES) continue;
    out.push({ filename: a.filename, contentType: a.content_type, dataBase64: buf.toString("base64") });
  }
  return out;
}
