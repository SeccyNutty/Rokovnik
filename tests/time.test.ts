import { describe, expect, it } from "vitest";
import { addDays, dateKey, formatDateLong, formatWhen, timeKey, weekdayOfKey, zonedToUtc } from "@/lib/time";

describe("vrijeme (Europe/Zagreb)", () => {
  it("zimsko računanje je UTC+1", () => {
    expect(zonedToUtc("2026-12-15", "14:15").toISOString()).toBe("2026-12-15T13:15:00.000Z");
  });
  it("ljetno računanje je UTC+2", () => {
    expect(zonedToUtc("2027-06-10", "09:00").toISOString()).toBe("2027-06-10T07:00:00.000Z");
  });
  it("dan promjene sata (28. 3. 2027.)", () => {
    expect(zonedToUtc("2027-03-28", "01:30").toISOString()).toBe("2027-03-28T00:30:00.000Z");
    expect(zonedToUtc("2027-03-28", "12:00").toISOString()).toBe("2027-03-28T10:00:00.000Z");
    expect(zonedToUtc("2026-10-25", "12:00").toISOString()).toBe("2026-10-25T11:00:00.000Z");
  });
  it("ponoć i povratak u lokalni datum", () => {
    const d = zonedToUtc("2026-11-17");
    expect(d.toISOString()).toBe("2026-11-16T23:00:00.000Z");
    expect(dateKey(d)).toBe("2026-11-17");
    expect(timeKey(d)).toBe("00:00");
  });
  it("dani i nazivi", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekdayOfKey("2026-11-17")).toBe(1);
    expect(formatDateLong("2026-11-17")).toBe("utorak, 17. studenoga 2026.");
  });
  it("opis termina", () => {
    const start = zonedToUtc("2026-11-17", "14:15");
    expect(formatWhen({ startsAt: start, endsAt: zonedToUtc("2026-11-17", "16:00"), allDay: false, kind: "event" })).toBe(
      "utorak, 17. studenoga 2026. · 14:15–16:00",
    );
    expect(formatWhen({ startsAt: zonedToUtc("2026-12-15"), endsAt: null, allDay: true, kind: "deadline" })).toBe(
      "do kraja dana: utorak, 15. prosinca 2026.",
    );
  });
});
