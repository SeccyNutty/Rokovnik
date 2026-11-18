import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests, type Db } from "@/db";
import { communities, items, senderRules } from "@/db/schema";
import { parseExtractedItems } from "@/lib/extract/types";
import { extractWithRules } from "@/lib/extract/heuristic";
import { nameKey, requestOrganization } from "@/lib/org-requests";
import { approveRequest, createCommunity, ingestEmail, toNewItem } from "@/lib/pipeline";
import { listCommunities, listItems, listTagCounts, scopeFor } from "@/lib/queries";
import { cleanTags, guessTags } from "@/lib/tags";

let db: Db;
beforeEach(async () => {
  db = await resetDbForTests();
});

const future = (days: number) => new Date(Date.now() + days * 24 * 3600_000);

async function org(slug: string) {
  const [c] = await db.insert(communities).values({ slug, name: slug.toUpperCase() }).returning();
  return c;
}
async function item(communityId: string, title: string, tags: string[], days = 10, status: "published" | "hidden" = "published") {
  const [row] = await db
    .insert(items)
    .values({ communityId, kind: "event", title, startsAt: future(days), dedupeKey: `${title}-${days}`, tags, status })
    .returning();
  return row;
}

describe("oznake", () => {
  it("čišćenje: samo poznate, bez ponavljanja, najviše četiri", () => {
    expect(cleanTags(["stipendija", "STIPENDIJA", "izmisljena", "radionica", "jezici", "sport", "kultura"])).toEqual(["stipendija", "radionica", "jezici", "sport"]);
    expect(cleanTags("radionica, tecaj")).toEqual(["radionica", "tecaj"]);
    expect(cleanTags(null)).toEqual([]);
  });

  it("AI odgovor: nepoznate oznake se odbacuju, a nedostajuće ne ruše stavku", () => {
    const [a, b] = parseExtractedItems({
      items: [
        { kind: "deadline", title: "Stipendije Grada", start_date: "2027-01-15", tags: ["stipendija", "lazna"], confidence: 0.9 },
        { kind: "event", title: "Radionica", start_date: "2027-01-16", confidence: 0.9 },
      ],
    });
    expect(a.tags).toEqual(["stipendija"]);
    expect(b.tags).toEqual([]);
  });

  it("bez AI-ja oznake se pogađaju po ključnim riječima", async () => {
    expect(guessTags("Natječaj za dodjelu stipendija Grada Zagreba")).toEqual(expect.arrayContaining(["stipendija", "natjecaj"]));
    expect(guessTags("Radionica cjeloživotnog obrazovanja: tečaj njemačkog jezika")).toEqual(["radionica", "tecaj", "cjelozivotno"]);
    const out = await extractWithRules({ subject: "Radionica lemljenja", text: "Radionica će se održati 9. 12. 2026. u 15 h.", receivedAt: new Date("2026-11-18T09:00:00Z") });
    expect(out.items[0].tags).toContain("radionica");
  });

  it("stavka bez oznaka od AI-ja dobiva ih iz naslova; stara kategorija se popunjava iz oznake", () => {
    const [x] = parseExtractedItems({ items: [{ kind: "event", title: "Predavanje o robotici", start_date: "2026-12-03", confidence: 0.9 }] });
    const row = toNewItem(x, "00000000-0000-4000-8000-000000000000", null, new Date("2026-11-18T09:00:00Z"))!;
    expect(row.tags).toEqual(["predavanje"]);
    const [y] = parseExtractedItems({ items: [{ kind: "deadline", title: "Rok", start_date: "2026-12-03", tags: ["stipendija"], confidence: 0.9 }] });
    expect(toNewItem(y, "00000000-0000-4000-8000-000000000000", null, new Date("2026-11-18T09:00:00Z"))!.category).toBe("scholarship");
  });
});

describe("tematske zajednice", () => {
  it("tema skuplja objave svih organizacija s njezinim oznakama", async () => {
    const fsb = await org("fsb");
    const grad = await org("grad");
    await item(fsb.id, "Stipendija FSB", ["stipendija"]);
    await item(grad.id, "Gradska stipendija", ["stipendija", "natjecaj"]);
    await item(grad.id, "Koncert", ["kultura"]);
    await item(grad.id, "Skrivena stipendija", ["stipendija"], 12, "hidden");
    const topic = await createCommunity({ name: "Stipendije", topicTags: ["stipendija", "nepoznata"] });
    expect(topic).toMatchObject({ kind: "topic", topicTags: ["stipendija"] });

    const titles = (await listItems(scopeFor([topic]))).map((r) => r.title).sort();
    expect(titles).toEqual(["Gradska stipendija", "Stipendija FSB"]);

    // Organizacija + tema zajedno (Moj kalendar): unija bez duplikata.
    const both = await listItems(scopeFor([topic, fsb]));
    expect(both.map((r) => r.title).sort()).toEqual(["Gradska stipendija", "Stipendija FSB"]);

    // Broj nadolazećih za temu računa se po oznakama.
    const list = await listCommunities();
    expect(list.find((c) => c.slug === topic.slug)?.upcoming).toBe(2);
    expect(list.find((c) => c.slug === "grad")?.upcoming).toBe(2);
  });

  it("filtar po temi i brojanje tema u opsegu", async () => {
    const grad = await org("grad");
    await item(grad.id, "Gradska stipendija", ["stipendija", "natjecaj"]);
    await item(grad.id, "Koncert", ["kultura"]);
    await item(grad.id, "Poziv", ["natjecaj"]);
    expect((await listItems({ communityIds: [grad.id], tag: "natjecaj" })).map((r) => r.title).sort()).toEqual(["Gradska stipendija", "Poziv"]);
    expect(await listTagCounts({ communityIds: [grad.id] })).toEqual([
      { key: "natjecaj", n: 2 },
      { key: "kultura", n: 1 },
      { key: "stipendija", n: 1 },
    ]);
    // Prazan opseg = prazan rezultat (npr. tema bez oznaka).
    expect(await listItems({ communityIds: [], anyTags: [] })).toEqual([]);
  });

  it("pošiljatelj se nikad ne veže uz tematsku zajednicu", async () => {
    const topic = await createCommunity({ name: "Radionice", topicTags: ["radionica"] });
    const r = await ingestEmail(
      { provider: "test", providerId: "t1", from: "ured@novi.example", subject: "Radionica", text: "Radionica 9. 12. 2030. u 15 h.", receivedAt: new Date(), auth: { dmarc: "pass", spf: "pass", dkim: "pass" } },
      { notifyAdmin: async () => {}, feedback: async () => {} },
    );
    const approved = await approveRequest(r.requestId!, { existingCommunityId: topic.id }, { notifyAdmin: async () => {}, feedback: async () => {} });
    expect(approved!.community.kind).toBe("organization");
    expect(approved!.community.id).not.toBe(topic.id);
    expect(await db.select().from(senderRules).where(eq(senderRules.communityId, topic.id))).toHaveLength(0);
  });
});

describe("tražene organizacije", () => {
  it("isti naziv zbraja zahtjeve, administrator dobiva mail za prvi i treći", async () => {
    const sent: string[] = [];
    const notify = async (subject: string) => void sent.push(subject);
    expect(nameKey("Tehničko veleučilište u Zagrebu!")).toBe("tehnicko veleuciliste u zagrebu");

    expect(await requestOrganization({ name: "Tehničko veleučilište u Zagrebu", email: "ana@gmail.com", website: "https://tvz.hr" }, { notify })).toEqual({ ok: true, count: 1 });
    expect(await requestOrganization({ name: "tehnicko veleuciliste u zagrebu", email: "ANA@gmail.com" }, { notify })).toEqual({ ok: true, count: 2 });
    expect(await requestOrganization({ name: "TEHNIČKO VELEUČILIŠTE U ZAGREBU", email: "ivo@gmail.com" }, { notify })).toEqual({ ok: true, count: 3 });
    expect(sent).toEqual(["Tražena zajednica: Tehničko veleučilište u Zagrebu", "Tražena zajednica: Tehničko veleučilište u Zagrebu (3 zahtjeva)"]);

    const { listOrganizationRequests } = await import("@/lib/queries");
    const [row] = await listOrganizationRequests();
    expect(row).toMatchObject({ requestCount: 3, website: "https://tvz.hr", contactEmails: ["ana@gmail.com", "ivo@gmail.com"] });
  });

  it("odbija neispravne podatke i postojeće zajednice", async () => {
    await org("fsb");
    expect(await requestOrganization({ name: "fs" })).toMatchObject({ ok: false, reason: "naziv" });
    expect(await requestOrganization({ name: "Udruga X", website: "javascript:alert(1)" })).toMatchObject({ ok: false, reason: "web" });
    expect(await requestOrganization({ name: "Udruga X", email: "nije-mail" })).toMatchObject({ ok: false, reason: "email" });
    expect(await requestOrganization({ name: "fsb" })).toMatchObject({ ok: false, reason: "postoji", slug: "fsb" });
  });
});
