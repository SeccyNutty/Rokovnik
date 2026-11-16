import { describe, expect, it } from "vitest";
import { addEventLinks, subscribeLinks } from "@/lib/calendar-links";
import { buildCalendar, escapeText, foldLine, type IcsItem } from "@/lib/ics";
import { zonedToUtc } from "@/lib/time";

const base: IcsItem = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "event",
  title: "Gostujuće predavanje: Roboti, ljudi; i ostalo",
  summary: "Predavanje o suradničkoj robotici.",
  description: "Predavanje o suradničkoj robotici.\nUlaz slobodan.",
  startsAt: zonedToUtc("2026-12-15", "14:15"),
  endsAt: zonedToUtc("2026-12-15", "16:00"),
  allDay: false,
  location: "Dvorana A, FSB",
  onlineUrl: null,
  registrationUrl: "https://example.org/prijava",
  communityName: "FSB",
  category: "lecture",
  sequence: 2,
  updatedAt: new Date("2026-11-16T10:00:00Z"),
};
const url = "https://rokovnik.example";

describe("ICS", () => {
  it("događaj s vremenom", () => {
    const raw = buildCalendar({ name: "FSB", items: [base], baseUrl: url });
    const ics = raw.replace(/\r\n /g, "");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:11111111-1111-4111-8111-111111111111@rokovnik\r\n");
    expect(ics).toContain("DTSTART:20261215T131500Z");
    expect(ics).toContain("DTEND:20261215T150000Z");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain("SUMMARY:Gostujuće predavanje: Roboti\\, ljudi\\; i ostalo");
    expect(ics).toContain("LOCATION:Dvorana A\\, FSB");
    expect(ics).not.toContain("VALARM");
  });
  it("rok bez vremena je cjelodnevni, s podsjetnikom dan prije", () => {
    const d: IcsItem = { ...base, kind: "deadline", title: "Prijava na hackathon", startsAt: zonedToUtc("2026-12-10"), endsAt: null, allDay: true };
    const ics = buildCalendar({ name: "FSB", items: [d], baseUrl: url });
    expect(ics).toContain("SUMMARY:ROK: Prijava na hackathon");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261210");
    expect(ics).toContain("DTEND;VALUE=DATE:20261211");
    expect(ics).toContain("TRIGGER:-P1D");
  });
  it("višednevni cjelodnevni događaj uključuje zadnji dan", () => {
    const d: IcsItem = { ...base, startsAt: zonedToUtc("2027-03-20"), endsAt: zonedToUtc("2027-03-21"), allDay: true };
    const ics = buildCalendar({ name: "FSB", items: [d], baseUrl: url });
    expect(ics).toContain("DTSTART;VALUE=DATE:20270320");
    expect(ics).toContain("DTEND;VALUE=DATE:20270322");
  });
  it("redci nisu dulji od 75 okteta", () => {
    const ics = buildCalendar({ name: "FSB", items: [{ ...base, description: "čćžšđ ".repeat(80) }], baseUrl: url });
    const enc = new TextEncoder();
    for (const line of ics.split("\r\n")) expect(enc.encode(line).length).toBeLessThanOrEqual(75);
    expect(foldLine("a".repeat(80)).split("\r\n")[1].startsWith(" ")).toBe(true);
    const BS = String.fromCharCode(92);
    expect(escapeText(`a,b;c${BS}d\ne`)).toBe(`a${BS},b${BS};c${BS}${BS}d${BS}ne`);
  });
  it("poveznice za dodavanje jednog događaja", () => {
    const l = addEventLinks(base, url);
    expect(l.google).toContain("dates=20261215T131500Z%2F20261215T150000Z");
    expect(l.google).toContain("action=TEMPLATE");
    expect(l.outlook).toContain("startdt=2026-12-15T13%3A15%3A00.000Z");
    expect(l.ics).toBe(`${url}/ics/d/${base.id}.ics`);
    const day = addEventLinks({ ...base, kind: "deadline", startsAt: zonedToUtc("2026-12-10"), endsAt: null, allDay: true }, url);
    expect(day.google).toContain("dates=20261210%2F20261211");
    expect(day.outlook).toContain("allday=true");
  });
  it("poveznice za pretplatu na kalendar", () => {
    const s = subscribeLinks(url, "/ics/fsb.ics", "FSB");
    expect(s.webcal).toBe("webcal://rokovnik.example/ics/fsb.ics");
    expect(s.google).toBe("https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Frokovnik.example%2Fics%2Ffsb.ics");
    expect(s.outlook).toContain("addfromweb?url=https%3A%2F%2Frokovnik.example%2Fics%2Ffsb.ics&name=FSB");
  });
});
