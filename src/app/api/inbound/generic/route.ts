import { createHmac } from "node:crypto";
import { z } from "zod";
import { baseUrlFromRequest } from "@/lib/base-url";
import { ingestEmail } from "@/lib/pipeline";
import { safeEqual } from "@/lib/tokens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  messageId: z.string().min(1).max(500),
  from: z.string().min(3).max(500),
  subject: z.string().max(1000).default(""),
  text: z.string().max(200_000).nullish(),
  html: z.string().max(500_000).nullish(),
  date: z.string().nullish(),
  auth: z.object({ spf: z.string().optional(), dkim: z.string().optional(), dmarc: z.string().optional() }).nullish(),
});

/**
 * Općeniti ulaz za mail iz bilo kojeg izvora (npr. Cloudflare Email Worker ili
 * skripta `pnpm mail:test`). Tijelo je JSON, potpisano zaglavljem
 * X-Signature: sha256=<hex HMAC-SHA256 tijela ključem INBOUND_SECRET>.
 */
export async function POST(request: Request) {
  const secret = process.env.INBOUND_SECRET;
  if (!secret) return Response.json({ error: "INBOUND_SECRET nije postavljen." }, { status: 503 });
  const raw = await request.text();
  const given = (request.headers.get("x-signature") ?? "").replace(/^sha256=/, "");
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (!given || !safeEqual(given, expected)) return Response.json({ error: "Neispravan potpis." }, { status: 401 });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Neispravan JSON." }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Neispravni podaci.", details: parsed.error.issues }, { status: 400 });
  const b = parsed.data;
  const when = b.date ? new Date(b.date) : new Date();
  const result = await ingestEmail(
    {
      provider: "generic",
      providerId: b.messageId,
      from: b.from,
      subject: b.subject,
      text: b.text,
      html: b.html,
      receivedAt: Number.isNaN(when.getTime()) ? new Date() : when,
      auth: b.auth ?? null,
    },
    { baseUrl: baseUrlFromRequest(request) },
  );
  return Response.json({ status: result.status, duplicate: result.duplicate, items: result.itemIds.length });
}
