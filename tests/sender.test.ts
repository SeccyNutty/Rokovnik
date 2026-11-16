import { describe, expect, it } from "vitest";
import { candidateDomains, cleanSubject, findForwardedOriginal, stripForwardHeader, parseMailbox, requestKeyFor, slugify, suggestCommunityName } from "@/lib/sender";

describe("pošiljatelj", () => {
  it("čita adresu i ime", () => {
    expect(parseMailbox('"Ured dekana" <Dekanat@FSB.unizg.hr>')).toEqual({ name: "Ured dekana", address: "dekanat@fsb.unizg.hr" });
    expect(parseMailbox("ana@example.org")).toEqual({ name: "", address: "ana@example.org" });
  });
  it("domena za organizacije, točna adresa za javne servise", () => {
    expect(requestKeyFor("okruznica@fsb.unizg.hr")).toEqual({ kind: "domain", value: "fsb.unizg.hr" });
    expect(requestKeyFor("ivan@gmail.com")).toEqual({ kind: "address", value: "ivan@gmail.com" });
  });
  it("srodne domene, od uže prema široj (za podsjetnik u zahtjevu)", () => {
    expect(candidateDomains("stud.fsb.unizg.hr")).toEqual(["stud.fsb.unizg.hr", "fsb.unizg.hr", "unizg.hr"]);
    expect(candidateDomains("gmail.com")).toEqual([]);
  });
  it("prijedlog imena i slug", () => {
    expect(suggestCommunityName({ kind: "domain", value: "fsb.unizg.hr" })).toBe("FSB");
    expect(suggestCommunityName({ kind: "domain", value: "zagreb.hr" })).toBe("Zagreb");
    expect(suggestCommunityName({ kind: "address", value: "ivan@gmail.com" }, "Ivan Horvat")).toBe("Ivan Horvat");
    expect(slugify("Sveučilište u Zagrebu — Čačkalica đ")).toBe("sveuciliste-u-zagrebu-cackalica-d");
  });
  it("čisti naslov", () => {
    expect(cleanSubject("Fwd: FW: Re: Gostujuće predavanje")).toBe("Gostujuće predavanje");
    expect(cleanSubject("Prosl.: Okružnica")).toBe("Okružnica");
  });
  it("prepoznaje proslijeđenu poruku iz Gmaila (engleski i hrvatski)", () => {
    const en = `Pogledaj ovo\n\n---------- Forwarded message ---------\nFrom: Okružnica FSB <okruznica@fsb.unizg.hr>\nDate: Mon, 16 Nov 2026 at 10:02\nSubject: Gostujuće predavanje\nTo: <svi@fsb.unizg.hr>\n\nPoštovani,`;
    expect(findForwardedOriginal(en)).toEqual({ address: "okruznica@fsb.unizg.hr", name: "Okružnica FSB", subject: "Gostujuće predavanje" });
    const hr = `---------- Proslijeđena poruka ---------\nŠalje: Studentski zbor <zbor@fsb.unizg.hr>\nDatum: pon, 16. stu 2026. u 10:02\nPredmet: Hackathon\nPrima: svi\n\nTekst`;
    expect(findForwardedOriginal(hr)?.address).toBe("zbor@fsb.unizg.hr");
    expect(findForwardedOriginal(hr)?.subject).toBe("Hackathon");
  });
  it("prepoznaje proslijeđenu poruku iz Outlooka", () => {
    const o = `\n\nFrom: Ured za međunarodnu suradnju <international@unizg.hr>\nSent: Monday, November 16, 2026 9:00 AM\nTo: Svi\nSubject: Erasmus+ natječaj\n\nPoštovani`;
    expect(findForwardedOriginal(o)?.address).toBe("international@unizg.hr");
  });
  it("uklanja zaglavlje proslijeđene poruke i bilješku prosljeđivača", () => {
    const en = `Pogledaj ovo\n\n---------- Forwarded message ---------\nFrom: Okružnica FSB <okruznica@fsb.unizg.hr>\nDate: Mon, 16 Nov 2026 at 10:02\nSubject: Gostujuće predavanje\nTo: <svi@fsb.unizg.hr>\n\nPoštovani,\npredavanje je u utorak.`;
    expect(stripForwardHeader(en)).toBe("Poštovani,\npredavanje je u utorak.");
    expect(stripForwardHeader("Običan tekst.")).toBe("Običan tekst.");
    expect(suggestCommunityName({ kind: "domain", value: "robotika-udruga.hr" })).toBe("Robotika Udruga");
  });
  it("običan mail nije proslijeđena poruka", () => {
    expect(findForwardedOriginal("Pozdrav,\nFrom: nekog razloga pišem ovo.\nLp")).toBeNull();
    expect(findForwardedOriginal("Predavanje je u utorak.")).toBeNull();
  });
});
