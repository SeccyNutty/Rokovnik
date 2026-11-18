import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { communities, organizationRequests } from "@/db/schema";
import { APP_NAME, adminEmail } from "./config";
import { canSendEmail, sendEmail } from "./resend";

/** Naziv za usporedbu: mala slova, bez dijakritika i interpunkcije ("Tehničko veleučilište" = "tehnicko veleuciliste"). */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const EMAIL = /^[^\s@<>"]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
/** Obavijest administratoru za prvi zahtjev i kad se nakupi još zahtjeva za isti naziv. */
const NOTIFY_AT = new Set([1, 3, 10, 25, 50, 100]);

export type OrgRequestInput = { name: string; website?: string; note?: string; email?: string };
export type OrgRequestResult =
  | { ok: true; count: number }
  | { ok: false; reason: "naziv" | "web" | "email" | "postoji"; slug?: string };

/**
 * Zahtjev da se organizacija pridruži Rokovniku. Isti naziv zbraja zahtjeve; administrator
 * dobiva mail za prvi zahtjev i na brojkama iz NOTIFY_AT, da ga zahtjevi ne zatrpaju.
 */
export async function requestOrganization(input: OrgRequestInput, opts: { baseUrl?: string | null; notify?: (subject: string, text: string) => Promise<void> } = {}): Promise<OrgRequestResult> {
  const name = input.name.replace(/\s+/g, " ").trim();
  const key = nameKey(name);
  if (name.length < 3 || name.length > 120 || key.length < 3) return { ok: false, reason: "naziv" };
  const website = (input.website ?? "").trim().slice(0, 200);
  if (website && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(website)) return { ok: false, reason: "web" };
  const email = (input.email ?? "").trim().toLowerCase();
  if (email && (!EMAIL.test(email) || email.length > 200)) return { ok: false, reason: "email" };
  const note = (input.note ?? "").replace(/\s+/g, " ").trim().slice(0, 500);

  const db = await getDb();
  const existing = (await db.select({ slug: communities.slug, name: communities.name }).from(communities)).find((c) => nameKey(c.name) === key);
  if (existing) return { ok: false, reason: "postoji", slug: existing.slug };

  const [row] = await db
    .insert(organizationRequests)
    .values({ name, nameKey: key, website, note, contactEmails: email ? [email] : [] })
    .onConflictDoUpdate({
      target: organizationRequests.nameKey,
      set: {
        requestCount: sql`${organizationRequests.requestCount} + 1`,
        lastRequestedAt: new Date(),
        website: sql`case when ${organizationRequests.website} = '' then excluded.website else ${organizationRequests.website} end`,
        note: sql`case when ${organizationRequests.note} = '' then excluded.note else ${organizationRequests.note} end`,
        contactEmails: email
          ? sql`case when ${email} = any(${organizationRequests.contactEmails}) or cardinality(${organizationRequests.contactEmails}) >= 50 then ${organizationRequests.contactEmails} else array_append(${organizationRequests.contactEmails}, ${email}) end`
          : sql`${organizationRequests.contactEmails}`,
      },
    })
    .returning();

  if (NOTIFY_AT.has(row.requestCount) && row.status === "pending") {
    const subject = row.requestCount === 1 ? `Tražena zajednica: ${row.name}` : `Tražena zajednica: ${row.name} (${row.requestCount} zahtjeva)`;
    const text =
      `Posjetitelj ${APP_NAME}a traži da se organizacija „${row.name}” pridruži.\n\n` +
      `Broj zahtjeva: ${row.requestCount}\n` +
      (row.website ? `Mrežna stranica: ${row.website}\n` : "") +
      (row.note ? `Napomena: ${row.note}\n` : "") +
      `Broj osoba koje žele obavijest kad se pridruže: ${row.contactEmails.length}\n` +
      (opts.baseUrl ? `\nPregled: ${opts.baseUrl}/admin#trazene\n` : "");
    try {
      await (opts.notify ?? defaultNotify)(subject, text);
    } catch (e) {
      console.error("Obavijest o traženoj zajednici nije poslana:", e);
    }
  }
  return { ok: true, count: row.requestCount };
}

async function defaultNotify(subject: string, text: string): Promise<void> {
  const to = adminEmail();
  if (!to || !canSendEmail()) return;
  await sendEmail({ to, subject, text });
}

export async function setOrganizationRequestStatus(id: string, status: "pending" | "done" | "dismissed"): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const db = await getDb();
  await db.update(organizationRequests).set({ status }).where(eq(organizationRequests.id, id));
}
