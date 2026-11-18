import { cleanSubject, stripForwardHeader } from "../sender";
import { addDays, dateKey, isValidDateKey } from "../time";
import type { ExtractedItem, ExtractionInput, ExtractionResult } from "./types";
import { guessTags } from "../tags";

/**
 * Izvlačenje bez AI-ja, prema pravilima. Koristi se kad ANTHROPIC_API_KEY nije
 * postavljen (lokalni razvoj, demo). Prepoznaje hrvatske zapise datuma i vremena
 * te razlikuje rok od događaja prema riječima ispred datuma.
 */

const MONTHS: [RegExp, number][] = [
  [/^sij/, 1], [/^velj/, 2], [/^ožu|^ozu/, 3], [/^tra/, 4], [/^svi/, 5], [/^lip/, 6],
  [/^srp/, 7], [/^kol/, 8], [/^ruj/, 9], [/^lis/, 10], [/^stu/, 11], [/^pro/, 12],
];

const MONTH_WORD =
  "siječ\\w*|sijec\\w*|veljač\\w*|veljac\\w*|ožuj\\w*|ozuj\\w*|trav\\w*|svib\\w*|lip\\w*|srp\\w*|kolovoz\\w*|ruj\\w*|listopad\\w*|studen\\w*|prosin\\w*";

const DATE_RE = new RegExp(
  `(\\d{1,2})\\.\\s*(?:(\\d{1,2})\\.|(${MONTH_WORD}))\\s*(?:(\\d{4})\\.?)?`,
  "gi",
);

const TIME_RANGE_RE = /(\d{1,2})[:.](\d{2})\s*(?:h|sati)?\s*(?:[-–—]|do)\s*(\d{1,2})[:.](\d{2})/i;
const TIME_RE = /(?:\bu|\bod|,)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:h\b|sati\b|sata\b|sat\b)?/i;
const DEADLINE_HINT = /(rok\w*|prijav\w*|najkasnije|zaključno|zakljucno|deadline|predaj\w*|podnošenj\w*)/i;
const URL_RE = /https?:\/\/[^\s<>()"']+/gi;

const pad = (n: number) => String(n).padStart(2, "0");

function monthFromWord(word: string): number | null {
  const w = word.toLowerCase();
  for (const [re, n] of MONTHS) if (re.test(w)) return n;
  return null;
}

function resolveYear(day: number, month: number, explicit: number | null, refKey: string): string | null {
  const refYear = Number(refKey.slice(0, 4));
  if (explicit) {
    const key = `${explicit}-${pad(month)}-${pad(day)}`;
    return isValidDateKey(key) ? key : null;
  }
  // Bez godine: prvi takav datum koji nije više od tjedan dana prije primitka.
  for (const y of [refYear, refYear + 1]) {
    const key = `${y}-${pad(month)}-${pad(day)}`;
    if (isValidDateKey(key) && key >= addDays(refKey, -7)) return key;
  }
  return null;
}

function parseTime(after: string): { start: string | null; end: string | null } {
  const window = after.slice(0, 40);
  const range = TIME_RANGE_RE.exec(window);
  if (range) {
    const [h1, m1, h2, m2] = [range[1], range[2], range[3], range[4]].map(Number);
    if (h1 < 24 && m1 < 60 && h2 < 24 && m2 < 60) return { start: `${pad(h1)}:${pad(m1)}`, end: `${pad(h2)}:${pad(m2)}` };
  }
  const single = TIME_RE.exec(window);
  if (single) {
    const h = Number(single[1]);
    const m = single[2] ? Number(single[2]) : 0;
    const explicit = !!single[2] || /(?:h|sati|sata|sat)\b/i.test(single[0]);
    if (explicit && h < 24 && m < 60) return { start: `${pad(h)}:${pad(m)}`, end: null };
  }
  return { start: null, end: null };
}

function findLocation(text: string): string | null {
  const labelled = /^\s*(?:mjesto|lokacija|gdje|mjesto održavanja)\s*:\s*(.+)$/im.exec(text);
  if (labelled) return labelled[1].trim().replace(/[.;,]+$/, "").slice(0, 120);
  const hall = /\b(?:u\s+)?((?:dvoran[aiu]|predavaonic[aiu]|vijećnic[aiu]|učionic[aiu])\s+[^\s,.;:]+(?:\s+[A-ZČĆĐŠŽ0-9][^\s,.;:]*)?)/.exec(text);
  return hall ? hall[1].trim() : null;
}

export async function extractWithRules(input: ExtractionInput): Promise<ExtractionResult> {
  const refKey = dateKey(input.receivedAt);
  const subject = cleanSubject(input.subject) || "Obavijest";
  // Zaglavlje proslijeđene poruke ("Date: 12. 11. 2026.") nije termin događaja.
  const body = stripForwardHeader(input.text).replace(/^\s*>?\s*(?:date|datum|sent|poslano)\s*:.*$/gim, "");
  const full = `${subject}\n${body}`;

  type Hit = { key: string; start: string | null; end: string | null; deadline: boolean; index: number };
  const hits: Hit[] = [];
  for (const m of full.matchAll(DATE_RE)) {
    const day = Number(m[1]);
    const month = m[2] ? Number(m[2]) : monthFromWord(m[3] ?? "");
    if (!month || month > 12 || day < 1 || day > 31) continue;
    const key = resolveYear(day, month, m[4] ? Number(m[4]) : null, refKey);
    if (!key) continue;
    const idx = m.index ?? 0;
    const before = full.slice(Math.max(0, idx - 60), idx);
    const lineStart = before.lastIndexOf("\n");
    const sameLine = lineStart === -1 ? before : before.slice(lineStart + 1);
    const deadline = DEADLINE_HINT.test(sameLine) && /\bdo\b|rok|najkasnije|zaključno|zakljucno|deadline/i.test(sameLine);
    const time = parseTime(full.slice(idx + m[0].length));
    hits.push({ key, ...time, deadline, index: idx });
  }

  const urls = [...full.matchAll(URL_RE)].map((u) => u[0].replace(/[.,;]+$/, ""));
  const registrationUrl =
    urls.find((u) => /prijav|regist|form|apply|signup/i.test(u)) ??
    (() => {
      const m = /prijav[^\n]{0,80}?(https?:\/\/[^\s<>()"']+)/i.exec(full);
      return m ? m[1].replace(/[.,;]+$/, "") : null;
    })();
  const location = findLocation(full);
  const summary = body.replace(/\s+/g, " ").trim().slice(0, 240);
  const description = body.trim().slice(0, 2000);

  const items: ExtractedItem[] = [];
  const base = {
    summary,
    description,
    end_date: null,
    online_url: null,
    organizer: null,
    category: "other" as const,
    tags: guessTags(`${subject}\n${body}`),
    confidence: 0.4,
  };

  const eventHit = hits.find((h) => !h.deadline);
  if (eventHit) {
    items.push({
      ...base,
      kind: "event",
      title: subject.slice(0, 140),
      start_date: eventHit.key,
      start_time: eventHit.start,
      end_time: eventHit.end,
      location,
      registration_url: registrationUrl ?? null,
    });
  }
  const seen = new Set<string>();
  for (const h of hits.filter((x) => x.deadline)) {
    if (seen.has(h.key)) continue;
    seen.add(h.key);
    items.push({
      ...base,
      kind: "deadline",
      title: `Prijave: ${subject}`.slice(0, 140),
      start_date: h.key,
      start_time: h.start,
      end_time: null,
      location: null,
      registration_url: registrationUrl ?? null,
    });
  }
  return { items, extractor: "pravila" };
}
