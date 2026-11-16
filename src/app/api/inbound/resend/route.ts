import { baseUrlFromRequest } from "@/lib/base-url";
import { ingestEmail } from "@/lib/pipeline";
import { getReceivedEmail, verifySvixSignature } from "@/lib/resend";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Webhook za Resend (događaj email.received). Resend šalje samo metapodatke,
 * pa tijelo maila dohvaćamo preko API-ja i predajemo zajedničkoj obradi.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "RESEND_WEBHOOK_SECRET nije postavljen." }, { status: 503 });

  const body = await request.text();
  const ok = verifySvixSignature({
    secret,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body,
  });
  if (!ok) return Response.json({ error: "Neispravan potpis." }, { status: 401 });

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: "Neispravan JSON." }, { status: 400 });
  }
  if (event.type !== "email.received" || !event.data?.email_id) return Response.json({ ignored: true });

  try {
    const email = await getReceivedEmail(event.data.email_id);
    const result = await ingestEmail(
      {
        provider: "resend",
        providerId: email.id,
        // Zaglavlje From čuva i ime pošiljatelja; polje "from" je samo adresa.
        from: email.headers?.from ?? email.headers?.From ?? email.from,
        subject: email.subject ?? "",
        text: email.text,
        html: email.html,
        receivedAt: new Date(email.created_at),
        auth: email.authentication ?? null,
        hasAttachments: (email.attachments?.length ?? 0) > 0,
      },
      { baseUrl: baseUrlFromRequest(request) },
    );
    return Response.json({ status: result.status, duplicate: result.duplicate, items: result.itemIds.length });
  } catch (e) {
    console.error("Obrada dolaznog maila nije uspjela:", e);
    // 500 → Resend će ponoviti isporuku.
    return Response.json({ error: "Obrada nije uspjela." }, { status: 500 });
  }
}
