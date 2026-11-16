import { and, asc, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { communities, communityRequests, items, messages, senderRules, type Community, type Item } from "@/db/schema";
import { addEventLinks, type AddLinks } from "./calendar-links";
import { CATEGORY_LABELS, type Category } from "./extract/types";
import type { IcsItem } from "./ics";
import { candidateDomains } from "./sender";
import { dateKey, formatWhen, startOfToday, timeKey } from "./time";

/**
 * Datum kao parametar u ručno pisanom SQL-u. Pogon postgres-js ne prima Date izvan stupca
 * (PGlite prima), pa ga šaljemo kao ISO tekst s izričitim tipom.
 */
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

export type ItemRow = Item & { communityName: string; communitySlug: string };

/** Stavka pripremljena za prikaz: svi tekstovi termina izračunati su na poslužitelju. */
export type ItemView = {
  id: string;
  kind: "event" | "deadline";
  title: string;
  summary: string;
  description: string;
  /** Dan pod kojim se stavka prikazuje u popisu, "YYYY-MM-DD". */
  dayKey: string;
  /** Kratka oznaka vremena u popisu: "14:15", "cijeli dan", "do 12:00" ili "". */
  timeLabel: string;
  when: string;
  location: string | null;
  onlineUrl: string | null;
  registrationUrl: string | null;
  organizer: string | null;
  categoryLabel: string | null;
  communityName: string;
  communitySlug: string;
  links: AddLinks;
  pageUrl: string;
  unsure: boolean;
};

export function toIcs(r: ItemRow): IcsItem {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    summary: r.summary,
    description: r.description,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    allDay: r.allDay,
    location: r.location,
    onlineUrl: r.onlineUrl,
    registrationUrl: r.registrationUrl,
    communityName: r.communityName,
    category: r.category,
    sequence: r.sequence,
    updatedAt: r.updatedAt,
  };
}

export function toView(r: ItemRow, baseUrl: string, now = new Date()): ItemView {
  const startKey = dateKey(r.startsAt);
  const todayKey = dateKey(now);
  const ongoing = r.endsAt && startKey < todayKey && dateKey(r.endsAt) >= todayKey;
  let timeLabel = "";
  if (r.kind === "deadline") timeLabel = r.allDay ? "" : `do ${timeKey(r.startsAt)}`;
  else if (ongoing) timeLabel = "traje";
  else timeLabel = r.allDay ? "cijeli dan" : timeKey(r.startsAt);
  const category = r.category as Category;
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    summary: r.summary,
    description: r.description,
    dayKey: ongoing ? todayKey : startKey,
    timeLabel,
    when: formatWhen(r),
    location: r.location,
    onlineUrl: r.onlineUrl,
    registrationUrl: r.registrationUrl,
    organizer: r.organizer,
    categoryLabel: category !== "other" && CATEGORY_LABELS[category] ? CATEGORY_LABELS[category] : null,
    communityName: r.communityName,
    communitySlug: r.communitySlug,
    links: addEventLinks(toIcs(r), baseUrl),
    pageUrl: `${baseUrl}/d/${r.id}`,
    unsure: r.confidence < 0.5,
  };
}

const itemColumns = {
  id: items.id,
  communityId: items.communityId,
  messageId: items.messageId,
  kind: items.kind,
  title: items.title,
  summary: items.summary,
  description: items.description,
  startsAt: items.startsAt,
  endsAt: items.endsAt,
  allDay: items.allDay,
  location: items.location,
  onlineUrl: items.onlineUrl,
  registrationUrl: items.registrationUrl,
  organizer: items.organizer,
  category: items.category,
  confidence: items.confidence,
  status: items.status,
  dedupeKey: items.dedupeKey,
  sequence: items.sequence,
  createdAt: items.createdAt,
  updatedAt: items.updatedAt,
  communityName: communities.name,
  communitySlug: communities.slug,
};

export type ItemFilter = {
  communityIds?: string[];
  kind?: "event" | "deadline";
  /** Stavke koje još traju ili počinju nakon ovog trenutka. */
  from?: Date;
  /** Stavke koje počinju prije ovog trenutka. */
  to?: Date;
  limit?: number;
  includeHidden?: boolean;
};

export async function listItems(f: ItemFilter = {}): Promise<ItemRow[]> {
  if (f.communityIds && f.communityIds.length === 0) return [];
  const db = await getDb();
  const where = [
    f.includeHidden ? undefined : eq(items.status, "published"),
    f.communityIds ? inArray(items.communityId, f.communityIds) : undefined,
    f.kind ? eq(items.kind, f.kind) : undefined,
    f.from ? gte(sql`coalesce(${items.endsAt}, ${items.startsAt})`, ts(f.from)) : undefined,
    f.to ? lt(items.startsAt, f.to) : undefined,
  ].filter(Boolean);
  return db
    .select(itemColumns)
    .from(items)
    .innerJoin(communities, eq(items.communityId, communities.id))
    .where(and(...where))
    .orderBy(asc(items.startsAt), asc(items.title))
    .limit(f.limit ?? 200);
}

export function listUpcoming(f: Omit<ItemFilter, "from"> = {}, now = new Date()): Promise<ItemRow[]> {
  return listItems({ ...f, from: startOfToday(now) });
}

export async function getItem(id: string, includeHidden = false): Promise<ItemRow | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const db = await getDb();
  const [row] = await db
    .select(itemColumns)
    .from(items)
    .innerJoin(communities, eq(items.communityId, communities.id))
    .where(and(eq(items.id, id), includeHidden ? undefined : eq(items.status, "published")));
  return row ?? null;
}

export type CommunityWithCount = Community & { upcoming: number };

export async function listCommunities(now = new Date()): Promise<CommunityWithCount[]> {
  const db = await getDb();
  const all = await db.select().from(communities).orderBy(asc(communities.name));
  const counts = await db
    .select({ communityId: items.communityId, n: count() })
    .from(items)
    .where(and(eq(items.status, "published"), gte(sql`coalesce(${items.endsAt}, ${items.startsAt})`, ts(startOfToday(now)))))
    .groupBy(items.communityId);
  const byId = new Map(counts.map((c) => [c.communityId, Number(c.n)]));
  return all.map((c) => ({ ...c, upcoming: byId.get(c.id) ?? 0 }));
}

export async function getCommunityBySlug(slug: string): Promise<Community | null> {
  const db = await getDb();
  const [row] = await db.select().from(communities).where(eq(communities.slug, slug.toLowerCase()));
  return row ?? null;
}

export async function getCommunitiesBySlugs(slugs: string[]): Promise<Community[]> {
  const clean = [...new Set(slugs.map((s) => s.toLowerCase()).filter((s) => /^[a-z0-9-]{1,60}$/.test(s)))];
  if (!clean.length) return [];
  const db = await getDb();
  return db.select().from(communities).where(inArray(communities.slug, clean)).orderBy(asc(communities.name));
}

// ── Administracija ────────────────────────────────────────────────────────────

export async function listRequests(status: "pending" | "approved" | "rejected" = "pending") {
  const db = await getDb();
  return db.select().from(communityRequests).where(eq(communityRequests.status, status)).orderBy(desc(communityRequests.createdAt));
}

export async function getRequest(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(communityRequests).where(eq(communityRequests.id, id));
  return row ?? null;
}

export async function listRecentMessages(limit = 30) {
  const db = await getDb();
  return db
    .select({
      id: messages.id,
      subject: messages.subject,
      senderAddress: messages.senderAddress,
      forwardedBy: messages.forwardedBy,
      status: messages.status,
      error: messages.error,
      extractor: messages.extractor,
      receivedAt: messages.receivedAt,
      communityName: communities.name,
    })
    .from(messages)
    .leftJoin(communities, eq(messages.communityId, communities.id))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
}

export async function listRules() {
  const db = await getDb();
  return db.select().from(senderRules).orderBy(asc(senderRules.value));
}

export async function listRecentItems(limit = 40): Promise<ItemRow[]> {
  const db = await getDb();
  return db
    .select(itemColumns)
    .from(items)
    .innerJoin(communities, eq(items.communityId, communities.id))
    .orderBy(desc(items.updatedAt))
    .limit(limit);
}

/**
 * Postoji li zajednica čija je domena šira ili uža varijanta ove (npr. zahtjev za
 * stud.fsb.unizg.hr, a fsb.unizg.hr već pripada FSB-u)? Služi kao podsjetnik u zahtjevu.
 */
export async function relatedCommunities(request: { kind: "domain" | "address"; value: string }): Promise<{ id: string; name: string; domain: string }[]> {
  if (request.kind !== "domain") return [];
  const db = await getDb();
  const rows = await db
    .select({ id: communities.id, name: communities.name, domain: senderRules.value })
    .from(senderRules)
    .innerJoin(communities, eq(senderRules.communityId, communities.id))
    .where(eq(senderRules.kind, "domain"));
  const parents = candidateDomains(request.value).slice(1);
  return rows.filter((r) => parents.includes(r.domain) || r.domain.endsWith(`.${request.value}`));
}
