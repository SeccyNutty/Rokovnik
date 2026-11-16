import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests, type Db } from "@/db";
import { communities, communityRequests, items, messages, senderRules } from "@/db/schema";
import { extractWithRules } from "@/lib/extract/heuristic";
import type { Extractor } from "@/lib/extract/types";
import { approveRequest, ingestEmail, processMessage, rejectRequest, senderAuthOk, type InboundEmail, type PipelineDeps } from "@/lib/pipeline";
import { dateKey, timeKey } from "@/lib/time";

let db: Db;
let notified: string[];
let n = 0;

const lecture: Extractor = async () => ({
  extractor: "ai",
  items: [
    {
      kind: "event", title: "Gostujuće predavanje: Suradnička robotika", summary: "Predavanje.", description: "Opis.",
      start_date: "2026-12-15", start_time: "14:15", end_date: null, end_time: "16:00", location: "Dvorana A",
      online_url: null, registration_url: "https://example.org/prijava", organizer: "FSB", category: "lecture", confidence: 0.9,
    },
    {
      kind: "deadline", title: "Prijava na predavanje", summary: "", description: "",
      start_date: "2026-12-10", start_time: null, end_date: null, end_time: null, location: null,
      online_url: null, registration_url: "javascript:alert(1)", organizer: null, category: "lecture", confidence: 0.9,
    },
  ],
});

function deps(extra: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    extract: lecture,
    notifyAdmin: async (r) => void notified.push(r.value),
    baseUrl: "https://rokovnik.example",
    forwarders: ["hrvoje@gmail.com"],
    ...extra,
  };
}

function mail(over: Partial<InboundEmail> = {}): InboundEmail {
  n += 1;
  return {
    provider: "test",
    providerId: `m-${n}`,
    from: "Okružnica FSB <okruznica@fsb.unizg.hr>",
    subject: "Gostujuće predavanje",
    text: "Predavanje će se održati 15. 12. 2026. u 14:15 u dvorani A.",
    receivedAt: new Date("2026-11-16T09:00:00Z"),
    ...over,
  };
}

beforeEach(async () => {
  db = await resetDbForTests();
  notified = [];
});

describe("dolazni mail", () => {
  it("nepoznata domena otvara zahtjev; potvrda stvara zajednicu i objavljuje", async () => {
    const first = await ingestEmail(mail(), deps());
    expect(first.status).toBe("pending_community");
    expect(notified).toEqual(["fsb.unizg.hr"]);
    expect(await db.select().from(items)).toHaveLength(0);

    // Drugi mail s iste domene čeka isti zahtjev, bez nove obavijesti.
    const second = await ingestEmail(mail({ from: "zbor@fsb.unizg.hr", subject: "Drugo" }), deps());
    expect(second.requestId).toBe(first.requestId);
    expect(notified).toHaveLength(1);

    const [request] = await db.select().from(communityRequests);
    expect(request).toMatchObject({ kind: "domain", value: "fsb.unizg.hr", suggestedName: "FSB", suggestedSlug: "fsb", status: "pending" });

    const approved = await approveRequest(request.id, {}, deps());
    expect(approved?.community).toMatchObject({ name: "FSB", slug: "fsb" });
    expect(approved?.processed).toHaveLength(2);

    const published = await db.select().from(items);
    // Dva maila daju iste dvije stavke: drugi ih ažurira, ne duplicira.
    expect(published).toHaveLength(2);
    const event = published.find((i) => i.kind === "event")!;
    expect(event.status).toBe("published");
    expect(event.sequence).toBe(1);
    expect(dateKey(event.startsAt)).toBe("2026-12-15");
    expect(timeKey(event.startsAt)).toBe("14:15");
    expect(timeKey(event.endsAt!)).toBe("16:00");
    expect(event.registrationUrl).toBe("https://example.org/prijava");
    const deadline = published.find((i) => i.kind === "deadline")!;
    expect(deadline.allDay).toBe(true);
    expect(deadline.registrationUrl).toBeNull(); // nesigurna poveznica je odbačena

    const rules = await db.select().from(senderRules);
    expect(rules).toMatchObject([{ kind: "domain", value: "fsb.unizg.hr" }]);
  });

  it("poznata domena objavljuje odmah; poddomena traži potvrdu", async () => {
    const first = await ingestEmail(mail(), deps());
    await approveRequest(first.requestId!, {}, deps());
    const sub = await ingestEmail(mail({ from: "student@stud.fsb.unizg.hr", subject: "Poddomena" }), deps());
    expect(sub.status).toBe("pending_community");
    expect(notified).toEqual(["fsb.unizg.hr", "stud.fsb.unizg.hr"]);
    const next = await ingestEmail(mail({ from: "dekanat@fsb.unizg.hr", subject: "Novo" }), deps({ extract: async () => ({
      extractor: "ai",
      items: [{ kind: "event", title: "Hackathon", summary: "", description: "", start_date: "2027-03-20", start_time: null, end_date: "2027-03-21", end_time: null, location: null, online_url: null, registration_url: null, organizer: null, category: "hackathon", confidence: 0.8 }],
    }) }));
    expect(next.status).toBe("published");
    expect(next.itemIds).toHaveLength(1);
    const [hack] = await db.select().from(items).where(eq(items.id, next.itemIds[0]));
    expect(hack.allDay).toBe(true);
    expect(dateKey(hack.endsAt!)).toBe("2027-03-21");
  });

  it("isti mail dvaput se ne obrađuje dvaput", async () => {
    const m = mail();
    await ingestEmail(m, deps());
    const again = await ingestEmail(m, deps());
    expect(again.duplicate).toBe(true);
    expect(await db.select().from(messages)).toHaveLength(1);
  });

  it("proslijeđeni mail od povjerljive adrese svrstava se prema izvornom pošiljatelju", async () => {
    const fwd = mail({
      from: "Hrvoje <hrvoje@gmail.com>",
      subject: "Fwd: Gostujuće predavanje",
      text: "---------- Forwarded message ---------\nFrom: Okružnica FSB <okruznica@fsb.unizg.hr>\nDate: Mon, 16 Nov 2026\nSubject: Gostujuće predavanje\n\nPredavanje 15. 12. 2026. u 14:15.",
    });
    const r = await ingestEmail(fwd, deps());
    expect(r.status).toBe("pending_community");
    const [request] = await db.select().from(communityRequests);
    expect(request.value).toBe("fsb.unizg.hr");
    const [m] = await db.select().from(messages);
    expect(m).toMatchObject({ senderAddress: "okruznica@fsb.unizg.hr", forwardedBy: "hrvoje@gmail.com", subject: "Gostujuće predavanje" });
  });

  it("proslijeđeni mail od nepoznate adrese vodi se pod tom adresom", async () => {
    const r = await ingestEmail(
      mail({ from: "netko@gmail.com", text: "---------- Forwarded message ---------\nFrom: <dekan@fsb.unizg.hr>\nDate: x\nSubject: y\n\nTekst" }),
      deps(),
    );
    expect(r.status).toBe("pending_community");
    const [request] = await db.select().from(communityRequests);
    expect(request).toMatchObject({ kind: "address", value: "netko@gmail.com" });
  });

  it("odbijen pošiljatelj ostaje blokiran", async () => {
    const first = await ingestEmail(mail({ from: "spam@reklame.example" }), deps());
    expect(await rejectRequest(first.requestId!)).toBe(true);
    const later = await ingestEmail(mail({ from: "drugi@reklame.example" }), deps());
    expect(later.status).toBe("rejected");
    expect(notified).toHaveLength(1);
    expect(await db.select().from(communities)).toHaveLength(0);
  });

  it("mail koji ne prolazi provjeru pošiljatelja se ne objavljuje", async () => {
    const first = await ingestEmail(mail(), deps());
    await approveRequest(first.requestId!, {}, deps());
    const before = (await db.select().from(items)).length;
    const spoof = await ingestEmail(mail({ auth: { spf: "fail", dkim: "fail", dmarc: "fail" } }), deps());
    expect(spoof.status).toBe("unauthenticated");
    expect((await db.select().from(items)).length).toBe(before);
    expect(senderAuthOk({ spf: "pass", dkim: "pass", dmarc: "pass" })).toBe(true);
    expect(senderAuthOk({ spf: "pass", dkim: "fail", dmarc: "unknown" })).toBe(true);
    expect(senderAuthOk({ spf: "fail", dkim: "fail", dmarc: "unknown" })).toBe(false);
    expect(senderAuthOk(null)).toBe(true);
  });

  it("potvrda može vezati pošiljatelja uz postojeću zajednicu", async () => {
    const a = await ingestEmail(mail(), deps());
    const fsb = await approveRequest(a.requestId!, {}, deps());
    const b = await ingestEmail(mail({ from: "Ana <ana@gmail.com>", subject: "Treće" }), deps());
    const joined = await approveRequest(b.requestId!, { existingCommunityId: fsb!.community.id }, deps());
    expect(joined?.community.id).toBe(fsb!.community.id);
    expect(await db.select().from(communities)).toHaveLength(1);
    expect(await db.select().from(senderRules)).toHaveLength(2);
  });

  it("greška pri izvlačenju ostavlja poruku za ponovni pokušaj", async () => {
    const a = await ingestEmail(mail(), deps());
    await approveRequest(a.requestId!, {}, deps());
    const failing = await ingestEmail(mail({ subject: "Puklo" }), deps({ extract: async () => { throw new Error("AI nedostupan"); } }));
    expect(failing.status).toBe("failed");
    const retry = await processMessage(failing.messageId, deps());
    expect(retry.status).toBe("published");
  });

  it("mail bez datuma ne objavljuje ništa", async () => {
    const a = await ingestEmail(mail(), deps());
    await approveRequest(a.requestId!, {}, deps());
    const r = await ingestEmail(mail({ subject: "Zahvala", text: "Hvala svima na dolasku." }), deps({ extract: extractWithRules }));
    expect(r.status).toBe("no_items");
  });
});

describe("izvlačenje prema pravilima (bez AI-ja)", () => {
  const at = new Date("2026-11-16T09:00:00Z");
  it("događaj s rokom prijave", async () => {
    const r = await extractWithRules({
      subject: "Fwd: Radionica 3D ispisa",
      text: "Pozivamo vas na radionicu 3D ispisa koja će se održati 3. prosinca 2026. od 17:00 do 19:30 u dvorani B.\nPrijave do 28. 11. putem obrasca https://example.org/prijava-radionica.\nMjesto: Laboratorij za aditivne tehnologije",
      receivedAt: at,
    });
    expect(r.items).toHaveLength(2);
    const [event, deadline] = r.items;
    expect(event).toMatchObject({ kind: "event", title: "Radionica 3D ispisa", start_date: "2026-12-03", start_time: "17:00", end_time: "19:30", location: "Laboratorij za aditivne tehnologije" });
    expect(deadline).toMatchObject({ kind: "deadline", start_date: "2026-11-28", start_time: null, registration_url: "https://example.org/prijava-radionica" });
  });
  it("datum bez godine u siječnju ide u sljedeću godinu", async () => {
    const r = await extractWithRules({ subject: "Smotra", text: "Smotra sveučilišta održat će se 14. 1. u 10 sati.", receivedAt: at });
    expect(r.items[0]).toMatchObject({ start_date: "2027-01-14", start_time: "10:00" });
  });
  it("zaglavlje proslijeđene poruke nije termin", async () => {
    const r = await extractWithRules({ subject: "Obavijest", text: "From: a@b.hr\nDate: 12. 11. 2026.\nSubject: Obavijest\n\nNema nastave.", receivedAt: at });
    expect(r.items).toHaveLength(0);
  });
});
