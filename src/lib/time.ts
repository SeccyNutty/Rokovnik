import { TZ } from "./config";

/** Sva vremena u bazi su UTC; prikaz i unos su u vremenskoj zoni Europe/Zagreb. */

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export type LocalParts = {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = ponedjeljak */
  weekday: number;
};

export function localParts(d: Date): LocalParts {
  const map: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(d)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAY_INDEX[map.weekday] ?? 0,
  };
}

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

/** Lokalni datum kao "YYYY-MM-DD". */
export function dateKey(d: Date): string {
  const p = localParts(d);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Lokalno vrijeme kao "HH:MM". */
export function timeKey(d: Date): string {
  const p = localParts(d);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

function offsetMs(utc: number): number {
  const p = localParts(new Date(utc));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utc / 1000) * 1000;
}

/** Lokalni datum i vrijeme (Zagreb) → UTC trenutak. Ispravno i preko promjene ljetnog računanja. */
export function zonedToUtc(date: string, time: string | null = null): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time ?? "00:00").split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm, 0);
  let utc = wall - offsetMs(wall);
  const again = wall - offsetMs(utc);
  if (again !== utc) utc = again;
  return new Date(utc);
}

export function isValidDateKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function isValidTimeKey(s: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

/** Zbrajanje dana nad "YYYY-MM-DD" (kalendarski, bez vremenske zone). */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Dan u tjednu za "YYYY-MM-DD"; 0 = ponedjeljak. */
export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export const WEEKDAYS_SHORT = ["pon", "uto", "sri", "čet", "pet", "sub", "ned"];
export const WEEKDAYS_LONG = ["ponedjeljak", "utorak", "srijeda", "četvrtak", "petak", "subota", "nedjelja"];
export const MONTHS_SHORT = ["sij", "velj", "ožu", "tra", "svi", "lip", "srp", "kol", "ruj", "lis", "stu", "pro"];
export const MONTHS_NOMINATIVE = [
  "siječanj", "veljača", "ožujak", "travanj", "svibanj", "lipanj",
  "srpanj", "kolovoz", "rujan", "listopad", "studeni", "prosinac",
];
export const MONTHS_GENITIVE = [
  "siječnja", "veljače", "ožujka", "travnja", "svibnja", "lipnja",
  "srpnja", "kolovoza", "rujna", "listopada", "studenoga", "prosinca",
];

/** "utorak, 17. studenoga 2026." */
export function formatDateLong(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${WEEKDAYS_LONG[weekdayOfKey(key)]}, ${d}. ${MONTHS_GENITIVE[m - 1]} ${y}.`;
}

/** "17. 11." ili "17. 11. 2027." kad godina nije tekuća. */
export function formatDateShort(key: string, currentYear?: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return currentYear && y !== currentYear ? `${d}. ${m}. ${y}.` : `${d}. ${m}.`;
}

export type WhenInput = { startsAt: Date; endsAt: Date | null; allDay: boolean; kind: "event" | "deadline" };

/** Puni opis termina za opis događaja, npr. "utorak, 17. studenoga 2026. · 14:15–16:00". */
export function formatWhen(i: WhenInput): string {
  const startKey = dateKey(i.startsAt);
  const endKey = i.endsAt ? dateKey(i.endsAt) : startKey;
  if (i.kind === "deadline") {
    return i.allDay
      ? `do kraja dana: ${formatDateLong(startKey)}`
      : `do ${timeKey(i.startsAt)}: ${formatDateLong(startKey)}`;
  }
  if (i.allDay) {
    return endKey !== startKey
      ? `${formatDateLong(startKey)} – ${formatDateLong(endKey)}`
      : `${formatDateLong(startKey)} · cijeli dan`;
  }
  if (i.endsAt && endKey !== startKey) {
    return `${formatDateLong(startKey)} u ${timeKey(i.startsAt)} – ${formatDateLong(endKey)} u ${timeKey(i.endsAt)}`;
  }
  const range = i.endsAt ? `${timeKey(i.startsAt)}–${timeKey(i.endsAt)}` : timeKey(i.startsAt);
  return `${formatDateLong(startKey)} · ${range}`;
}

/** Početak današnjeg dana (Zagreb) kao UTC trenutak. */
export function startOfToday(now = new Date()): Date {
  return zonedToUtc(dateKey(now));
}
