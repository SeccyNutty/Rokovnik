"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { communities, communityManagers, items, messages, senderRules } from "@/db/schema";
import { audit } from "@/lib/audit";
import { actorLabel, currentUser, isAdmin } from "@/lib/auth";
import { baseUrl } from "@/lib/base-url";
import { touchData } from "@/lib/cache";
import { discardMessage, releaseMessage } from "@/lib/pipeline";
import { requestKeyFor } from "@/lib/sender";
import { canManage } from "@/lib/users";

/**
 * Radnje nad jednom zajednicom. Smije ih izvesti administrator ili osoba koja upravlja tom
 * zajednicom (račun vrste "organizacija"). Ovlast se provjerava u bazi pri svakoj radnji.
 */
const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const EMAIL = /^[^\s@<>"]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

async function authorize(communityId: string): Promise<{ actor: string; admin: boolean }> {
  const admin = await isAdmin();
  if (!admin) {
    const user = await currentUser();
    if (!user || !/^[0-9a-f-]{36}$/i.test(communityId) || !(await canManage(user, communityId))) redirect("/prijava?next=/organizacija");
  }
  return { actor: await actorLabel(), admin };
}

function back(form: FormData, note: string): never {
  const from = str(form, "povratak") === "admin" ? "/admin" : "/organizacija";
  redirect(`${from}?poruka=${note}`);
}

async function changed() {
  await touchData();
  revalidatePath("/", "layout");
}

export async function saveCommunityAction(form: FormData): Promise<void> {
  const id = str(form, "communityId");
  const { actor, admin } = await authorize(id);
  const db = await getDb();
  const name = str(form, "name").slice(0, 80);
  const authMode = str(form, "authMode") === "relaxed" ? "relaxed" : "strict";
  const senderMode = str(form, "senderMode") === "addresses" ? "addresses" : "domain";
  const [before] = await db.select().from(communities).where(eq(communities.id, id));
  if (!before) back(form, "nema");
  await db
    .update(communities)
    .set({
      // Ime mijenja samo administrator; blažu provjeru pošiljatelja također (to je sigurnosna odluka).
      name: admin && name ? name : before.name,
      description: str(form, "description").slice(0, 400),
      authMode: admin ? authMode : before.authMode,
      senderMode,
    })
    .where(eq(communities.id, id));
  await audit(actor, "zajednica-spremljena", before.slug, `provjera=${admin ? authMode : before.authMode} pošiljatelji=${senderMode}`);
  await changed();
  back(form, "spremljeno");
}

/** Dopuštena adresa: mail s nje ide u zajednicu i kad je uključen način "samo dopuštene adrese". */
export async function addSenderAction(form: FormData): Promise<void> {
  const id = str(form, "communityId");
  const { actor, admin } = await authorize(id);
  const address = str(form, "address").toLowerCase();
  if (!EMAIL.test(address)) back(form, "adresa-neispravna");
  const db = await getDb();
  // Organizacija smije dodati samo adrese s domene koja već pripada njezinoj zajednici.
  if (!admin) {
    const key = requestKeyFor(address);
    const own = await db.select().from(senderRules).where(and(eq(senderRules.communityId, id), eq(senderRules.kind, "domain")));
    if (key.kind !== "domain" || !own.some((r) => r.value === key.value)) back(form, "adresa-tuda");
  }
  const added = await db.insert(senderRules).values({ communityId: id, kind: "address", value: address }).onConflictDoNothing().returning();
  if (!added.length) back(form, "adresa-zauzeta");
  await audit(actor, "posiljatelj-dodan", id, address);
  back(form, "spremljeno");
}

export async function removeSenderAction(form: FormData): Promise<void> {
  const id = str(form, "communityId");
  const { actor } = await authorize(id);
  const db = await getDb();
  const removed = await db
    .delete(senderRules)
    .where(and(eq(senderRules.id, str(form, "ruleId")), eq(senderRules.communityId, id), eq(senderRules.kind, "address")))
    .returning();
  if (removed.length) await audit(actor, "posiljatelj-uklonjen", id, removed[0].value);
  back(form, "spremljeno");
}

/** Samo administrator: tko upravlja zajednicom (račun vrste "organizacija"). */
export async function addManagerAction(form: FormData): Promise<void> {
  const id = str(form, "communityId");
  const { actor, admin } = await authorize(id);
  if (!admin) back(form, "nema-ovlasti");
  const email = str(form, "email").toLowerCase();
  if (!EMAIL.test(email)) back(form, "adresa-neispravna");
  const db = await getDb();
  await db.insert(communityManagers).values({ communityId: id, email }).onConflictDoNothing();
  await audit(actor, "upravitelj-dodan", id, email);
  back(form, "spremljeno");
}

export async function removeManagerAction(form: FormData): Promise<void> {
  const id = str(form, "communityId");
  const { actor, admin } = await authorize(id);
  if (!admin) back(form, "nema-ovlasti");
  const db = await getDb();
  const removed = await db
    .delete(communityManagers)
    .where(and(eq(communityManagers.id, str(form, "managerId")), eq(communityManagers.communityId, id)))
    .returning();
  if (removed.length) await audit(actor, "upravitelj-uklonjen", id, removed[0].email);
  back(form, "spremljeno");
}

/** Zadržani mail: objavi ili odbaci. */
export async function decideHeldAction(form: FormData): Promise<void> {
  const db = await getDb();
  const [m] = await db.select().from(messages).where(eq(messages.id, str(form, "messageId")));
  if (!m?.communityId) back(form, "nema");
  const { actor } = await authorize(m.communityId);
  if (str(form, "odluka") === "odbaci") {
    await discardMessage(m.id);
    await audit(actor, "mail-odbacen", m.communityId, m.subject);
    back(form, "odbaceno");
  }
  const result = await releaseMessage(m.id, { baseUrl: await baseUrl() });
  await audit(actor, "mail-objavljen-rucno", m.communityId, m.subject);
  await changed();
  back(form, result?.status === "published" ? "objavljeno" : "bez-stavki");
}

export async function toggleItemAction(form: FormData): Promise<void> {
  const db = await getDb();
  const [row] = await db.select().from(items).where(eq(items.id, str(form, "itemId")));
  if (!row) back(form, "nema");
  const { actor } = await authorize(row.communityId);
  const status = row.status === "published" ? "hidden" : "published";
  await db.update(items).set({ status, updatedAt: new Date() }).where(eq(items.id, row.id));
  await audit(actor, status === "hidden" ? "objava-sakrivena" : "objava-prikazana", row.communityId, row.title);
  await changed();
  back(form, "spremljeno");
}
