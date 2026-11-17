import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Zajednica = prostor jedne organizacije (FSB, UNIZG, Grad Zagreb…). */
export const communities = pgTable("communities", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Pravilo svrstavanja: mail s ove domene (ili točne adrese) ide u zajednicu. */
export const senderRules = pgTable("sender_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"domain" | "address">().notNull(),
  value: text("value").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/**
 * Zahtjev za novu zajednicu: nastaje kad stigne mail s domene koju sustav ne
 * poznaje. Odbijen zahtjev ostaje zapisan i služi kao blokada tog pošiljatelja.
 */
export const communityRequests = pgTable("community_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").$type<"domain" | "address">().notNull(),
  value: text("value").notNull().unique(),
  suggestedName: text("suggested_name").notNull(),
  suggestedSlug: text("suggested_slug").notNull(),
  sampleFrom: text("sample_from").notNull().default(""),
  sampleSubject: text("sample_subject").notNull().default(""),
  status: text("status").$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
  communityId: uuid("community_id").references(() => communities.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  decidedAt: ts("decided_at"),
});

export type MessageStatus =
  | "pending_community" // čeka potvrdu nove zajednice
  | "processing"
  | "published" // izvučene i objavljene stavke
  | "no_items" // mail bez događaja ili roka
  | "rejected" // pošiljatelj odbijen
  | "unauthenticated" // mail nije prošao provjeru pošiljatelja (SPF/DKIM/DMARC)
  | "failed"; // greška pri obradi, može se ponoviti

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerId: text("provider_id").notNull(),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name").notNull().default(""),
    /** Stvarni pošiljatelj nakon razmotavanja proslijeđene poruke. */
    senderAddress: text("sender_address").notNull(),
    forwardedBy: text("forwarded_by"),
    subject: text("subject").notNull().default(""),
    textBody: text("text_body").notNull().default(""),
    receivedAt: ts("received_at").notNull(),
    auth: jsonb("auth").$type<{ spf?: string; dkim?: string; dmarc?: string } | null>(),
    hasAttachments: boolean("has_attachments").notNull().default(false),
    communityId: uuid("community_id").references(() => communities.id, { onDelete: "set null" }),
    requestId: uuid("request_id").references(() => communityRequests.id, { onDelete: "set null" }),
    status: text("status").$type<MessageStatus>().notNull(),
    error: text("error"),
    extractor: text("extractor"),
    createdAt: ts("created_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
  },
  (t) => [
    uniqueIndex("messages_provider_uid").on(t.provider, t.providerId),
    index("messages_request_idx").on(t.requestId),
  ],
);

export type ItemKind = "event" | "deadline";
export type ItemStatus = "published" | "hidden";

/** Stavka kalendara: događaj ili rok. */
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    kind: text("kind").$type<ItemKind>().notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    description: text("description").notNull().default(""),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at"),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    onlineUrl: text("online_url"),
    registrationUrl: text("registration_url"),
    organizer: text("organizer"),
    category: text("category").notNull().default("other"),
    confidence: real("confidence").notNull().default(1),
    status: text("status").$type<ItemStatus>().notNull().default("published"),
    dedupeKey: text("dedupe_key").notNull(),
    /** Raste pri svakoj izmjeni da kalendari ažuriraju, a ne dupliciraju događaj. */
    sequence: integer("sequence").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("items_dedupe_uid").on(t.communityId, t.dedupeKey),
    index("items_starts_idx").on(t.startsAt),
    // Kalendar jedne zajednice: nadolazeće stavke poredane po početku.
    index("items_community_starts_idx").on(t.communityId, t.startsAt),
  ],
);

export type Community = typeof communities.$inferSelect;
export type SenderRule = typeof senderRules.$inferSelect;
export type CommunityRequest = typeof communityRequests.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
