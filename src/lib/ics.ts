import { APP_NAME } from "./config";
import { addDays, dateKey } from "./time";
import { tagLabel } from "./tags";

/** Generiranje iCalendar (RFC 5545) zapisa. Vremena su u UTC-u, cjelodnevne stavke kao DATE. */

export type IcsItem = {
  id: string;
  kind: "event" | "deadline";
  title: string;
  summary: string;
  description: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  location: string | null;
  onlineUrl: string | null;
  registrationUrl: string | null;
  communityName: string;
  category: string;
  tags?: string[];
  sequence: number;
  updatedAt: Date;
};

const HOUR = 3600_000;

export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Prijelom redaka na najviše 75 okteta (UTF-8), nastavak počinje razmakom. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    if (bytes + len > limit) {
      out.push(current);
      current = " ";
      bytes = 1;
      limit = 75;
    }
    current += ch;
    bytes += len;
  }
  if (current) out.push(current);
  return out.join("\r\n");
}

const pad = (n: number) => String(n).padStart(2, "0");

export function utcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

const compactDate = (key: string) => key.replace(/-/g, "");

/** Početak i kraj stavke onako kako ih vide kalendari. */
export function eventSpan(i: Pick<IcsItem, "kind" | "startsAt" | "endsAt" | "allDay">):
  | { allDay: true; startKey: string; endKeyExclusive: string }
  | { allDay: false; start: Date; end: Date } {
  if (i.allDay) {
    const startKey = dateKey(i.startsAt);
    const lastKey = i.endsAt ? dateKey(i.endsAt) : startKey;
    return { allDay: true, startKey, endKeyExclusive: addDays(lastKey < startKey ? startKey : lastKey, 1) };
  }
  if (i.kind === "deadline") {
    // Rok s točnim vremenom: polusatni blok koji završava u trenutku roka.
    return { allDay: false, start: new Date(i.startsAt.getTime() - HOUR / 2), end: i.startsAt };
  }
  const end = i.endsAt && i.endsAt > i.startsAt ? i.endsAt : new Date(i.startsAt.getTime() + HOUR);
  return { allDay: false, start: i.startsAt, end };
}

export function calendarTitle(i: Pick<IcsItem, "kind" | "title">): string {
  return i.kind === "deadline" ? `ROK: ${i.title}` : i.title;
}

export function calendarDescription(i: IcsItem, itemUrl: string): string {
  const parts: string[] = [];
  if (i.summary && !i.description.includes(i.summary)) parts.push(i.summary);
  if (i.description) parts.push(i.description);
  if (i.registrationUrl) parts.push(`Prijava: ${i.registrationUrl}`);
  if (i.onlineUrl) parts.push(`Online: ${i.onlineUrl}`);
  parts.push(`${i.communityName} · ${APP_NAME}: ${itemUrl}`);
  return parts.join("\n\n");
}

function eventLines(i: IcsItem, baseUrl: string): string[] {
  const url = `${baseUrl}/d/${i.id}`;
  const span = eventSpan(i);
  const lines = [
    "BEGIN:VEVENT",
    // UID ne ovisi o domeni: promjena adrese aplikacije ne smije duplicirati događaje pretplatnicima.
    `UID:${i.id}@rokovnik`,
    `DTSTAMP:${utcStamp(i.updatedAt)}`,
    `LAST-MODIFIED:${utcStamp(i.updatedAt)}`,
    `SEQUENCE:${i.sequence}`,
    `SUMMARY:${escapeText(calendarTitle(i))}`,
  ];
  if (span.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(span.startKey)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(span.endKeyExclusive)}`);
    lines.push("TRANSP:TRANSPARENT");
  } else {
    lines.push(`DTSTART:${utcStamp(span.start)}`);
    lines.push(`DTEND:${utcStamp(span.end)}`);
  }
  const location = i.location || i.onlineUrl;
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  lines.push(`DESCRIPTION:${escapeText(calendarDescription(i, url))}`);
  lines.push(`URL:${url}`);
  lines.push(`CATEGORIES:${[i.communityName, ...(i.tags ?? []).map(tagLabel)].map(escapeText).join(",")}`);
  if (i.kind === "deadline") {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(calendarTitle(i))}`, "TRIGGER:-P1D", "END:VALARM");
  }
  lines.push("END:VEVENT");
  return lines;
}

export function buildCalendar(opts: { name: string; items: IcsItem[]; baseUrl: string }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${APP_NAME}//HR`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    "X-WR-TIMEZONE:Europe/Zagreb",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const item of opts.items) lines.push(...eventLines(item, opts.baseUrl));
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function icsResponse(body: string, filename: string, download = false): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
