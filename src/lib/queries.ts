import { and, asc, count, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { communities, communityManagers, communityRequests, items, messages, organizationRequests, senderRules, type Community, type Item } from "@/db/schema";
import { cachedQuery } from "./cache";
import { addEventLinks, type AddLinks } from "./calendar-links";
import { CATEGORY_LABELS, type Category } from "./extract/types";
import type { IcsItem } from "./ics";
import { candidateDomains } from "./sender";
import { tagLabel } from "./tags";
import { dateKey, formatWhen, startOfToday, timeKey } from "./time";

/**
 * Datum kao parametar u ručno pisanom SQL-u. Pogon postgres-js ne prima Date izvan stupca
 * (PGlite prima), pa ga šaljemo kao ISO tekst s izričitim tipom.
 */
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

/** Polje teksta kao parametar (radi jednako u postgres-js i PGlite). */
const textArray = (xs: string[]) => sql`ARRAY[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::text[]`;
const hasAnyTag = (xs: string[]) => sql`${items.tags} && ${textArray(xs)}`;
const hasTag = (x: string) => sql`${x} = ANY(${items.tags})`;

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
  tags: { key: string; label: string }[];
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
    tags: r.tags,
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
    categoryLabel: r.tags?.length ? tagLabel(r.tags[0]) : category !== "other" && CATEGORY_LABELS[category] ? CATEGORY_LABELS[category] : null,
    tags: (r.tags ?? []).map((key) => ({ key, label: tagLabel(key) })),
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
  tags: items.tags,
  confidence: items.confidence,
  status: items.status,
  dedupeKey: items.dedupeKey,
  sequence: items.sequence,
  createdAt: items.createdAt,
  updatedAt: items.updatedAt,
  communityName: communities.name,
  communitySlug: communities.slug,
};

/**
 * Opseg stavki: zajednice organizacija, oznake (tematske zajednice) i pojedinačno spremljene
 * stavke, spojeni s ILI. Ako nijedno nije zadano, opseg su sve objave; ako je zadano, ali je
 * sve prazno, rezultat je prazan.
 */
export type Scope = {
  communityIds?: string[];
  /** Stavke koje imaju barem jednu od ovih oznaka (tematske zajednice). */
  anyTags?: string[];
  /** Pojedinačno spremljene stavke. */
  itemIds?: string[];
};

export type ItemFilter = Scope & {
  kind?: "event" | "deadline";
  /** Sužavanje na jednu oznaku (filtar "Tema"). */
  tag?: string;
  /** Stavke koje još traju ili počinju nakon ovog trenutka. */
  from?: Date;
  /** Stavke koje počinju prije ovog trenutka. */
  to?: Date;
  limit?: number;
  includeHidden?: boolean;
};

/** SQL uvjet opsega; null znači "sigurno prazno", undefined "bez ograničenja". */
function scopeCondition(f: Scope) {
  if (f.communityIds === undefined && f.anyTags === undefined && f.itemIds === undefined) return undefined;
  const parts = [];
  if (f.communityIds?.length) parts.push(inArray(items.communityId, f.communityIds));
  if (f.anyTags?.length) parts.push(hasAnyTag(f.anyTags));
  if (f.itemIds?.length) parts.push(inArray(items.id, f.itemIds));
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : or(...parts);
}

/** Opseg za skup zajednica: organizacije po id-u, tematske po oznakama. */
export function scopeFor(cs: Pick<Community, "id" | "kind" | "topicTags">[]): { communityIds: string[]; anyTags: string[] } {
  return {
    communityIds: cs.filter((c) => c.kind !== "topic").map((c) => c.id),
    anyTags: [...new Set(cs.filter((c) => c.kind === "topic").flatMap((c) => c.topicTags))],
  };
}

export async function scopeForIds(ids: string[]): Promise<{ communityIds: string[]; anyTags: string[] }> {
  if (!ids.length) return { communityIds: [], anyTags: [] };
  const db = await getDb();
  return scopeFor(await db.select().from(communities).where(inArray(communities.id, ids)));
}

/** Filtar u obliku pogodnom za ključ predmemorije: datumi kao ISO tekst, polja poredana. */
type ItemFilterKey = Omit<ItemFilter, "from" | "to"> & { from?: string; to?: string };

const listItemsCached = cachedQuery("stavke", (k: ItemFilterKey) =>
  listItemsFresh({ ...k, from: k.from ? new Date(k.from) : undefined, to: k.to ? new Date(k.to) : undefined }),
);

const sorted = (xs?: string[]) => (xs ? [...xs].sort() : undefined);

/** Stavke prema filtru. Javni upiti idu kroz predmemoriju; administracija (includeHidden) uvijek čita bazu. */
export function listItems(f: ItemFilter = {}): Promise<ItemRow[]> {
  if (f.includeHidden) return listItemsFresh(f);
  return listItemsCached({
    communityIds: sorted(f.communityIds),
    anyTags: sorted(f.anyTags),
    itemIds: sorted(f.itemIds),
    kind: f.kind,
    tag: f.tag,
    from: f.from?.toISOString(),
    to: f.to?.toISOString(),
    limit: f.limit,
  });
}

async function listItemsFresh(f: ItemFilter = {}): Promise<ItemRow[]> {
  const scope = scopeCondition(f);
  if (scope === null) return [];
  const db = await getDb();
  const where = [
    f.includeHidden ? undefined : eq(items.status, "published"),
    scope,
    f.kind ? eq(items.kind, f.kind) : undefined,
    f.tag ? hasTag(f.tag) : undefined,
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

/** Koliko nadolazećih objava ima koja oznaka u opsegu (za filtar "Tema"). */
const tagCountsCached = cachedQuery("oznake", async (k: Scope & { kind?: "event" | "deadline"; from: string }) => {
  const scope = scopeCondition(k);
  if (scope === null) return [] as { key: string; n: number }[];
  const db = await getDb();
  const rows = await db
    .select({ tags: items.tags })
    .from(items)
    .where(
      and(
        eq(items.status, "published"),
        scope,
        k.kind ? eq(items.kind, k.kind) : undefined,
        gte(sql`coalesce(${items.endsAt}, ${items.startsAt})`, ts(new Date(k.from))),
      ),
    )
    .limit(3000);
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
});

export function listTagCounts(f: Scope & { kind?: "event" | "deadline" }, now = new Date()) {
  return tagCountsCached({ communityIds: sorted(f.communityIds), anyTags: sorted(f.anyTags), itemIds: sorted(f.itemIds), kind: f.kind, from: startOfToday(now).toISOString() });
}

export function listUpcoming(f: Omit<ItemFilter, "from"> = {}, now = new Date()): Promise<ItemRow[]> {
  return listItems({ ...f, from: startOfToday(now) });
}

const getItemCached = cachedQuery("stavka", (id: string) => getItemFresh(id, false));

export function getItem(id: string, includeHidden = false): Promise<ItemRow | null> {
  return includeHidden ? getItemFresh(id, true) : getItemCached(id.toLowerCase());
}

async function getItemFresh(id: string, includeHidden: boolean): Promise<ItemRow | null> {
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

const listCommunitiesCached = cachedQuery("zajednice", (todayIso: string) => listCommunitiesFresh(new Date(todayIso)));

/** Sve zajednice s brojem nadolazećih objava. */
export function listCommunities(now = new Date()): Promise<CommunityWithCount[]> {
  return listCommunitiesCached(startOfToday(now).toISOString());
}

async function listCommunitiesFresh(today: Date): Promise<CommunityWithCount[]> {
  const db = await getDb();
  const upcoming = and(eq(items.status, "published"), gte(sql`coalesce(${items.endsAt}, ${items.startsAt})`, ts(today)));
  // Dva neovisna upita idu usporedno (svaki svojom vezom).
  const [all, counts] = await Promise.all([
    db.select().from(communities).orderBy(asc(communities.name)),
    db.select({ communityId: items.communityId, n: count() }).from(items).where(upcoming).groupBy(items.communityId),
  ]);
  const byId = new Map(counts.map((c) => [c.communityId, Number(c.n)]));
  // Tematske zajednice broje objave svih organizacija s njihovim oznakama.
  const topics = all.filter((c) => c.kind === "topic" && c.topicTags.length);
  const topicCounts = await Promise.all(
    topics.map(async (c) => {
      const [row] = await db.select({ n: count() }).from(items).where(and(upcoming, hasAnyTag(c.topicTags)));
      return [c.id, Number(row?.n ?? 0)] as const;
    }),
  );
  for (const [id, n] of topicCounts) byId.set(id, n);
  return all.map((c) => ({ ...c, upcoming: byId.get(c.id) ?? 0 }));
}

const communityBySlugCached = cachedQuery("zajednica", async (slug: string): Promise<Community | null> => {
  const db = await getDb();
  const [row] = await db.select().from(communities).where(eq(communities.slug, slug));
  return row ?? null;
});

export function getCommunityBySlug(slug: string): Promise<Community | null> {
  const clean = slug.toLowerCase();
  // Neispravne adrese ne idu ni u predmemoriju ni u bazu.
  return /^[a-z0-9-]{1,60}$/.test(clean) ? communityBySlugCached(clean) : Promise.resolve(null);
}

const communitiesBySlugsCached = cachedQuery("zajednice-po-adresi", async (clean: string[]): Promise<Community[]> => {
  const db = await getDb();
  return db.select().from(communities).where(inArray(communities.slug, clean)).orderBy(asc(communities.name));
});

export function getCommunitiesBySlugs(slugs: string[]): Promise<Community[]> {
  const clean = [...new Set(slugs.map((s) => s.toLowerCase()).filter((s) => /^[a-z0-9-]{1,60}$/.test(s)))].sort();
  return clean.length ? communitiesBySlugsCached(clean) : Promise.resolve([]);
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


/** Zadržani mailovi (nedokazan pošiljatelj ili adresa izvan popisa), po zajednicama. */
export async function listHeldMessages(communityIds?: string[]) {
  if (communityIds && !communityIds.length) return [];
  const db = await getDb();
  return db
    .select({ id: messages.id, communityId: messages.communityId, subject: messages.subject, senderAddress: messages.senderAddress, error: messages.error, receivedAt: messages.receivedAt })
    .from(messages)
    .where(and(eq(messages.status, "held"), communityIds ? inArray(messages.communityId, communityIds) : undefined))
    .orderBy(desc(messages.createdAt))
    .limit(100);
}

export async function listManagers(communityIds?: string[]) {
  if (communityIds && !communityIds.length) return [];
  const db = await getDb();
  return db
    .select()
    .from(communityManagers)
    .where(communityIds ? inArray(communityManagers.communityId, communityIds) : undefined)
    .orderBy(asc(communityManagers.email));
}

export async function listRulesFor(communityIds: string[]) {
  if (!communityIds.length) return [];
  const db = await getDb();
  return db.select().from(senderRules).where(inArray(senderRules.communityId, communityIds)).orderBy(asc(senderRules.value));
}

/** Objave zajednica kojima korisnik upravlja (uključujući skrivene). */
export async function listItemsForManager(communityIds: string[], limit = 60): Promise<ItemRow[]> {
  if (!communityIds.length) return [];
  const db = await getDb();
  return db
    .select(itemColumns)
    .from(items)
    .innerJoin(communities, eq(items.communityId, communities.id))
    .where(inArray(items.communityId, communityIds))
    .orderBy(desc(items.startsAt))
    .limit(limit);
}


// ── Tražene organizacije ──────────────────────────────────────────────────────

export async function listOrganizationRequests(status: "pending" | "done" | "dismissed" = "pending") {
  const db = await getDb();
  return db
    .select()
    .from(organizationRequests)
    .where(eq(organizationRequests.status, status))
    .orderBy(desc(organizationRequests.requestCount), desc(organizationRequests.lastRequestedAt))
    .limit(200);
}
