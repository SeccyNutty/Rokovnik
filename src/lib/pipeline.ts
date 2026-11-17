import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { items as itemsTable } from "@/db/schema";
import { communities, communityRequests, items, messages, senderRules, type Community, type CommunityRequest, type Message, type NewItem } from "@/db/schema";
import { touchData } from "./cache";
import { sendPublisherFeedback, type FeedbackInput } from "./feedback";
import { allow } from "./ratelimit";
import { senderVerdict } from "./sender-auth";
import { adminEmail, APP_NAME, configuredBaseUrl, forwarderEmails } from "./config";
import { extractItems, llmProvider, type ExtractedItem, type Extractor } from "./extract";
import { canSendEmail, loadReceivedAttachments, sendEmail } from "./resend";
import { cleanSubject, findForwardedOriginal, parseMailbox, requestKeyFor, slugify, suggestCommunityName } from "./sender";
import { addDays, dateKey, isValidDateKey, isValidTimeKey, zonedToUtc } from "./time";
import { requestToken } from "./tokens";

/**
 * Tok dolaznog maila:
 *   mail → provjera pošiljatelja → zajednica prema domeni
 *        → (nepoznata domena: zahtjev za novu zajednicu, čeka potvrdu administratora)
 *        → izvlačenje događaja i rokova → automatska objava
 */

export type InboundEmail = {
  provider: "resend" | "generic" | "test";
  providerId: string;
  /** "Ime <adresa>" ili samo adresa */
  from: string;
  fromName?: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  receivedAt: Date;
  auth?: { spf?: string; dkim?: string; dmarc?: string } | null;
  hasAttachments?: boolean;
  /** Mail je unio prijavljeni administrator (testni mail): pošiljatelja ne treba dokazivati. */
  trusted?: boolean;
  /** Automatski ili masovni mail: ne šalje se povratna poruka. */
  automated?: boolean;
};

export type Attachment = { filename: string; contentType: string; dataBase64: string };

export type PipelineDeps = {
  extract?: Extractor;
  notifyAdmin?: (request: CommunityRequest, baseUrl: string | null) => Promise<void>;
  loadAttachments?: (message: Message) => Promise<Attachment[]>;
  baseUrl?: string | null;
  forwarders?: string[];
  /** Povratna poruka pošiljatelju; zadano šalje mail preko Resenda. */
  feedback?: (input: FeedbackInput) => Promise<void>;
};

export type IngestResult = {
  messageId: string;
  status: Message["status"];
  duplicate: boolean;
  communityId: string | null;
  requestId: string | null;
  itemIds: string[];
};

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      return text && text !== href ? `${text} (${href})` : href;
    })
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeUrl(u: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(u.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Izvučena stavka → redak u bazi. Vraća null za neispravne ili besmislene datume. */
export function toNewItem(x: ExtractedItem, communityId: string, messageId: string | null, receivedAt: Date): NewItem | null {
  if (!isValidDateKey(x.start_date)) return null;
  if (x.start_time && !isValidTimeKey(x.start_time)) return null;
  const refKey = dateKey(receivedAt);
  if (x.start_date < addDays(refKey, -60) || x.start_date > addDays(refKey, 3 * 365)) return null;

  const allDay = !x.start_time;
  const startsAt = zonedToUtc(x.start_date, x.start_time);
  let endsAt: Date | null = null;
  if (x.kind === "event") {
    const endDate = x.end_date && isValidDateKey(x.end_date) ? x.end_date : null;
    const endTime = x.end_time && isValidTimeKey(x.end_time) ? x.end_time : null;
    if (endTime && !allDay) endsAt = zonedToUtc(endDate ?? x.start_date, endTime);
    else if (endDate && endDate > x.start_date) endsAt = zonedToUtc(endDate, allDay ? null : x.start_time);
    if (endsAt && endsAt <= startsAt) endsAt = null;
  }
  const title = x.title.replace(/\s+/g, " ").trim();
  return {
    communityId,
    messageId,
    kind: x.kind,
    title,
    summary: x.summary,
    description: x.description,
    startsAt,
    endsAt,
    allDay,
    location: x.location,
    onlineUrl: safeUrl(x.online_url),
    registrationUrl: safeUrl(x.registration_url),
    organizer: x.organizer,
    category: x.category,
    confidence: x.confidence,
    dedupeKey: `${x.kind}|${x.start_date}|${slugify(title).slice(0, 60)}`,
  };
}

/**
 * Zajednica za pošiljatelja: točna adresa ili točna domena. Poddomene se namjerno
 * NE svrstavaju automatski pod širu domenu (pmf.unizg.hr nije isto što i unizg.hr):
 * za njih nastaje zahtjev, a administrator jednim klikom bira novu ili postojeću zajednicu.
 */
async function findCommunityFor(db: Db, sender: string): Promise<{ community: Community; byAddress: boolean } | null> {
  const key = requestKeyFor(sender);
  const rules = await db
    .select()
    .from(senderRules)
    .where(
      or(
        and(eq(senderRules.kind, "address"), eq(senderRules.value, sender)),
        key.kind === "domain" ? and(eq(senderRules.kind, "domain"), eq(senderRules.value, key.value)) : sql`false`,
      ),
    );
  if (!rules.length) return null;
  const rule = rules.find((r) => r.kind === "address") ?? rules[0];
  const [community] = await db.select().from(communities).where(eq(communities.id, rule.communityId));
  return community ? { community, byAddress: rule.kind === "address" } : null;
}

async function defaultNotifyAdmin(request: CommunityRequest, baseUrl: string | null): Promise<void> {
  const to = adminEmail();
  if (!to || !canSendEmail() || !baseUrl) return;
  const link = `${baseUrl}/potvrdi/${requestToken(request.id)}`;
  const who = request.kind === "domain" ? `domene ${request.value}` : `adrese ${request.value}`;
  await sendEmail({
    to,
    subject: `${APP_NAME}: nova zajednica „${request.suggestedName}”?`,
    text:
      `Stigao je mail s ${who}, koja još nema zajednicu.\n\n` +
      `Pošiljatelj: ${request.sampleFrom}\nNaslov: ${request.sampleSubject}\n\n` +
      `Potvrdi zajednicu „${request.suggestedName}” ili odbij pošiljatelja:\n${link}\n\n` +
      `Nakon potvrde mail se obrađuje i objavljuje automatski, kao i svi budući mailovi s ${who}.`,
  });
}

async function defaultLoadAttachments(message: Message): Promise<Attachment[]> {
  if (message.provider !== "resend" || !process.env.RESEND_API_KEY || !llmProvider()) return [];
  return loadReceivedAttachments(message.providerId);
}

export async function ingestEmail(email: InboundEmail, deps: PipelineDeps = {}): Promise<IngestResult> {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.provider, email.provider), eq(messages.providerId, email.providerId)));
  if (existing) {
    // Ponovljena isporuka istog maila. Ako je prva obrada prekinuta (npr. istek vremena
    // funkcije), poruka je ostala "u obradi": tada je dovršavamo umjesto da je preskočimo.
    const stuck = existing.status === "processing" && existing.communityId && Date.now() - existing.createdAt.getTime() > 90_000;
    if (stuck) {
      const retried = await processMessage(existing.id, deps);
      return { messageId: existing.id, status: retried.status, duplicate: true, communityId: existing.communityId, requestId: existing.requestId, itemIds: retried.itemIds };
    }
    return { messageId: existing.id, status: existing.status, duplicate: true, communityId: existing.communityId, requestId: existing.requestId, itemIds: [] };
  }

  const from = parseMailbox(email.from);
  if (!from.name && email.fromName) from.name = email.fromName;
  const text = (email.text ?? "").trim() || htmlToText(email.html);
  let subject = (email.subject ?? "").trim();
  let sender = from.address;
  let senderName = from.name;
  let forwardedBy: string | null = null;

  // Dokaz pošiljatelja. Prije nego znamo zajednicu vrijedi stroga provjera.
  let verdict = email.trusted ? "trusted" : senderVerdict(email.auth, "strict");
  if (verdict === "trusted" && (deps.forwarders ?? forwarderEmails()).includes(from.address)) {
    const original = findForwardedOriginal(text);
    if (original) {
      forwardedBy = from.address;
      sender = original.address;
      senderName = original.name;
      if (original.subject) subject = original.subject;
    }
  }
  subject = cleanSubject(subject);

  const base = {
    provider: email.provider,
    providerId: email.providerId,
    fromAddress: from.address,
    fromName: from.name,
    senderAddress: sender,
    forwardedBy,
    subject,
    textBody: text.slice(0, 60_000),
    receivedAt: email.receivedAt,
    auth: email.auth ?? null,
    hasAttachments: !!email.hasAttachments,
    verified: verdict === "trusted",
    automated: !!email.automated,
  };

  const insert = async (values: typeof messages.$inferInsert): Promise<Message | null> => {
    const [row] = await db.insert(messages).values(values).onConflictDoNothing().returning();
    return row ?? null;
  };
  const done = (m: Message | null, extra: Partial<IngestResult> = {}): IngestResult =>
    m
      ? { messageId: m.id, status: m.status, duplicate: false, communityId: m.communityId, requestId: m.requestId, itemIds: [], ...extra }
      : { messageId: "", status: "processing", duplicate: true, communityId: null, requestId: null, itemIds: [] };

  if (verdict === "rejected" || !sender.includes("@")) {
    return done(await insert({ ...base, status: "unauthenticated", error: "Mail nije prošao provjeru pošiljatelja (SPF/DKIM/DMARC)." }));
  }
  // Zaštita od zatrpavanja: jedan pošiljatelj najviše 60 mailova na dan.
  if (!email.trusted && !(await allow(`mail:${from.address}`, 60, 24 * 3600))) {
    return done(await insert({ ...base, status: "rejected", error: "Previše mailova s iste adrese u jednom danu." }));
  }

  const match = await findCommunityFor(db, sender);
  if (match) {
    const { community } = match;
    // Zajednica može dopustiti blažu provjeru (domene bez DMARC zapisa). Za proslijeđene mailove
    // povjerenje dolazi od prosljeđivača, koji je već dokazan.
    if (verdict !== "trusted" && !forwardedBy) verdict = senderVerdict(email.auth, community.authMode);
    let hold: string | null = null;
    if (verdict !== "trusted") hold = "Pošiljatelj nije dokazan: domena nema DMARC potvrdu. Objavi ručno ili promijeni provjeru za ovu zajednicu.";
    else if (community.senderMode === "addresses" && !match.byAddress) hold = "Adresa pošiljatelja nije na popisu dopuštenih za ovu zajednicu.";
    if (hold) {
      const held = await insert({ ...base, verified: verdict === "trusted", communityId: community.id, status: "held", error: hold });
      return done(held);
    }
    const m = await insert({ ...base, verified: true, communityId: community.id, status: "processing" });
    if (!m) return done(null);
    const processed = await processMessage(m.id, deps, { notify: true });
    return done(m, { status: processed.status, itemIds: processed.itemIds });
  }

  // Nepoznat pošiljatelj: postojeći zahtjev ili novi.
  const key = requestKeyFor(sender);
  let [request] = await db.select().from(communityRequests).where(eq(communityRequests.value, key.value));
  let isNew = false;
  if (!request) {
    const name = suggestCommunityName(key, senderName);
    [request] = await db
      .insert(communityRequests)
      .values({ kind: key.kind, value: key.value, suggestedName: name, suggestedSlug: slugify(name), sampleFrom: senderName ? `${senderName} <${sender}>` : sender, sampleSubject: subject, verified: verdict === "trusted" })
      .onConflictDoNothing()
      .returning();
    if (request) isNew = true;
    else [request] = await db.select().from(communityRequests).where(eq(communityRequests.value, key.value));
  }
  if (request.status === "rejected") {
    return done(await insert({ ...base, requestId: request.id, status: "rejected", error: "Pošiljatelj je odbijen." }));
  }
  if (request.status === "approved") {
    // Zajednica je u međuvremenu obrisana: zahtjev se ponovno otvara.
    await db.update(communityRequests).set({ status: "pending", decidedAt: null, communityId: null }).where(eq(communityRequests.id, request.id));
    isNew = true;
  }
  const m = await insert({ ...base, requestId: request.id, status: "pending_community" });
  if (m && verdict === "trusted") await notifySender(m, null, { status: "pending_community", itemIds: [] }, deps);
  if (m && isNew) {
    try {
      await (deps.notifyAdmin ?? defaultNotifyAdmin)(request, deps.baseUrl ?? configuredBaseUrl());
    } catch (e) {
      console.error("Obavijest administratoru nije poslana:", e);
    }
  }
  return done(m);
}

export type ProcessResult = { status: Message["status"]; itemIds: string[]; error?: string };

/** Izvlači stavke iz spremljenog maila i objavljuje ih. Može se ponoviti bez dupliciranja. */
/** Povratna poruka pošiljatelju. Nikad ne ruši obradu. */
async function notifySender(message: Message, community: Community | null, result: ProcessResult, deps: PipelineDeps): Promise<void> {
  try {
    const items = result.itemIds.length ? await (await getDb()).select().from(itemsTable).where(inArray(itemsTable.id, result.itemIds)) : [];
    await (deps.feedback ?? sendPublisherFeedback)({ message, community, status: result.status, items, baseUrl: deps.baseUrl ?? configuredBaseUrl() });
  } catch (e) {
    console.error("Povratna poruka pošiljatelju nije poslana:", e);
  }
}

export async function processMessage(messageId: string, deps: PipelineDeps = {}, opts: { notify?: boolean } = {}): Promise<ProcessResult> {
  const db = await getDb();
  const [message] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!message) return { status: "failed", itemIds: [], error: "Poruka ne postoji." };
  if (!message.communityId) return { status: message.status, itemIds: [], error: "Poruka još nema zajednicu." };

  await db.update(messages).set({ status: "processing", error: null }).where(eq(messages.id, messageId));
  try {
    let attachments: Attachment[] = [];
    if (message.hasAttachments) {
      try {
        attachments = await (deps.loadAttachments ?? defaultLoadAttachments)(message);
      } catch (e) {
        console.error("Privitci nisu učitani:", e);
      }
    }
    const result = await (deps.extract ?? extractItems)({
      subject: message.subject,
      text: message.textBody,
      receivedAt: message.receivedAt,
      attachments,
    });

    const itemIds: string[] = [];
    for (const extracted of result.items) {
      const row = toNewItem(extracted, message.communityId, message.id, message.receivedAt);
      if (!row) continue;
      const [saved] = await db
        .insert(items)
        .values(row)
        .onConflictDoUpdate({
          target: [items.communityId, items.dedupeKey],
          set: {
            messageId: row.messageId,
            title: row.title,
            summary: row.summary,
            description: row.description,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            allDay: row.allDay,
            location: row.location,
            onlineUrl: row.onlineUrl,
            registrationUrl: row.registrationUrl,
            organizer: row.organizer,
            category: row.category,
            confidence: row.confidence,
            sequence: sql`${items.sequence} + 1`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: items.id });
      itemIds.push(saved.id);
    }
    const status: Message["status"] = itemIds.length ? "published" : "no_items";
    await db.update(messages).set({ status, extractor: result.extractor, processedAt: new Date(), error: null }).where(eq(messages.id, messageId));
    await touchData();
    if (opts.notify) {
      const [community] = await db.select().from(communities).where(eq(communities.id, message.communityId));
      await notifySender(message, community ?? null, { status, itemIds }, deps);
    }
    return { status, itemIds };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.update(messages).set({ status: "failed", error: error.slice(0, 500), processedAt: new Date() }).where(eq(messages.id, messageId));
    return { status: "failed", itemIds: [], error };
  }
}

async function uniqueSlug(db: Db, wanted: string): Promise<string> {
  const base = slugify(wanted);
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const [hit] = await db.select({ id: communities.id }).from(communities).where(eq(communities.slug, slug));
    if (!hit) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createCommunity(input: { name: string; slug?: string; description?: string }): Promise<Community> {
  const db = await getDb();
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("Ime zajednice je obavezno.");
  const slug = await uniqueSlug(db, input.slug?.trim() || name);
  const [row] = await db.insert(communities).values({ name, slug, description: (input.description ?? "").trim() }).returning();
  return row;
}

export type ApproveInput = {
  name?: string;
  slug?: string;
  existingCommunityId?: string | null;
  /**
   * Ako je zadano, mailovi na čekanju obrađuju se naknadno (npr. nakon što je odgovor poslan),
   * pa potvrda ne čeka AI čitanje. Bez toga se obrađuju odmah.
   */
  defer?: (work: () => Promise<void>) => void;
};

/**
 * Potvrda zahtjeva: nastaje zajednica (ili se pošiljatelj veže uz postojeću),
 * sprema se pravilo za buduće mailove, a mailovi na čekanju se obrađuju i objavljuju.
 */
export async function approveRequest(
  requestId: string,
  input: ApproveInput = {},
  deps: PipelineDeps = {},
): Promise<{ community: Community; published: number; processed: ProcessResult[]; deferred: number } | null> {
  const db = await getDb();
  const [request] = await db.select().from(communityRequests).where(eq(communityRequests.id, requestId));
  if (!request || request.status !== "pending") return null;

  let community: Community | undefined;
  if (input.existingCommunityId) {
    [community] = await db.select().from(communities).where(eq(communities.id, input.existingCommunityId));
  }
  community ??= await createCommunity({ name: input.name?.trim() || request.suggestedName, slug: input.slug?.trim() || request.suggestedSlug });

  await db.insert(senderRules).values({ communityId: community.id, kind: request.kind, value: request.value }).onConflictDoNothing();
  await db.update(communityRequests).set({ status: "approved", decidedAt: new Date(), communityId: community.id }).where(eq(communityRequests.id, requestId));

  const waiting = await db
    .update(messages)
    .set({ communityId: community.id, status: "processing" })
    .where(and(eq(messages.requestId, requestId), eq(messages.status, "pending_community")))
    .returning({ id: messages.id });

  await touchData();

  if (input.defer && waiting.length) {
    input.defer(async () => {
      for (const m of waiting) {
        try {
          await processMessage(m.id, deps, { notify: true });
        } catch (e) {
          console.error("Naknadna obrada poruke nije uspjela", m.id, e);
        }
      }
    });
    return { community, published: 0, processed: [], deferred: waiting.length };
  }

  const processed: ProcessResult[] = [];
  for (const m of waiting) processed.push(await processMessage(m.id, deps, { notify: true }));
  return { community, published: processed.reduce((n, p) => n + p.itemIds.length, 0), processed, deferred: 0 };
}

/** Odbijanje: pošiljatelj ostaje zapisan kao odbijen, pa se budući mailovi ne obrađuju. */
export async function rejectRequest(requestId: string): Promise<boolean> {
  const db = await getDb();
  const [request] = await db
    .update(communityRequests)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(and(eq(communityRequests.id, requestId), eq(communityRequests.status, "pending")))
    .returning();
  if (!request) return false;
  await db
    .update(messages)
    .set({ status: "rejected", error: "Pošiljatelj je odbijen." })
    .where(and(eq(messages.requestId, requestId), eq(messages.status, "pending_community")));
  return true;
}


/** Zadržani mail (nedokazan pošiljatelj ili adresa izvan popisa): ručna objava. */
export async function releaseMessage(messageId: string, deps: PipelineDeps = {}): Promise<ProcessResult | null> {
  const db = await getDb();
  const [m] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!m || m.status !== "held" || !m.communityId) return null;
  return processMessage(messageId, deps, { notify: m.verified });
}

export async function discardMessage(messageId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(messages)
    .set({ status: "rejected", error: "Odbačeno ručno.", processedAt: new Date() })
    .where(and(eq(messages.id, messageId), eq(messages.status, "held")))
    .returning({ id: messages.id });
  return rows.length > 0;
}
