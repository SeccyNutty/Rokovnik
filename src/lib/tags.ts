/**
 * Oznake (teme) objava. Popis je fiksan, da se objave različitih organizacija mogu
 * pouzdano skupljati u tematske zajednice (npr. sve stipendije na jednom mjestu).
 * AI dodjeljuje 1–3 oznake; organizacija i administrator ih mogu ispraviti.
 */
export const TAGS = [
  { key: "predavanje", label: "Predavanje" },
  { key: "radionica", label: "Radionica" },
  { key: "tecaj", label: "Tečaj" },
  { key: "cjelozivotno", label: "Cjeloživotno obrazovanje" },
  { key: "jezici", label: "Jezici" },
  { key: "stipendija", label: "Stipendije i potpore" },
  { key: "natjecaj", label: "Natječaji i pozivi" },
  { key: "eu-fondovi", label: "EU fondovi" },
  { key: "okolis", label: "Zaštita okoliša" },
  { key: "poljoprivreda", label: "Poljoprivreda" },
  { key: "hackathon", label: "Hackathoni i natjecanja" },
  { key: "sajam", label: "Sajmovi i smotre" },
  { key: "karijera", label: "Karijera i praksa" },
  { key: "mobilnost", label: "Studentska razmjena" },
  { key: "studij", label: "Studij i ispiti" },
  { key: "psiholoska-podrska", label: "Psihološka podrška" },
  { key: "ukljucivost", label: "Manjine i uključivost" },
  { key: "kultura", label: "Kultura i druženje" },
  { key: "sport", label: "Sport" },
] as const;

export type TagKey = (typeof TAGS)[number]["key"];
export const TAG_KEYS = TAGS.map((t) => t.key) as unknown as readonly [TagKey, ...TagKey[]];
const LABELS = new Map<string, string>(TAGS.map((t) => [t.key, t.label]));
export const MAX_TAGS = 4;

export function tagLabel(key: string): string {
  return LABELS.get(key) ?? key;
}

export function isTag(key: unknown): key is TagKey {
  return typeof key === "string" && LABELS.has(key);
}

/** Očisti popis: samo poznate oznake, bez ponavljanja, najviše MAX_TAGS. */
export function cleanTags(input: unknown, max = MAX_TAGS): TagKey[] {
  const list = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[,\s]+/) : [];
  const out: TagKey[] = [];
  for (const raw of list) {
    const key = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (isTag(key) && !out.includes(key)) out.push(key);
    if (out.length >= max) break;
  }
  return out;
}

/** Stara kategorija (prije oznaka) → oznaka. */
export const CATEGORY_TO_TAG: Record<string, TagKey | undefined> = {
  lecture: "predavanje",
  workshop: "radionica",
  hackathon: "hackathon",
  competition: "hackathon",
  fair: "sajam",
  scholarship: "stipendija",
  call: "natjecaj",
  social: "kultura",
};

/** Oznake prema ključnim riječima: za čitanje bez AI-ja i kao rezerva. */
const KEYWORDS: [TagKey, RegExp][] = [
  ["predavanje", /predavanj|lecture|seminar|tribin|obran[ai] doktor/],
  ["radionica", /radionic|workshop/],
  ["tecaj", /tečaj|tecaj|course/],
  ["cjelozivotno", /cjeloživotn|cjelozivotn|lifelong/],
  ["jezici", /jezik|njemačk|njemack|engleskog|francusk|talijansk|španjolsk/],
  ["stipendija", /stipendij|potpor[ae] studentima|scholarship/],
  ["natjecaj", /natječaj|natjecaj|javni poziv|\bpoziv za\b|call for/],
  ["eu-fondovi", /\beu\b|europsk|esf|erdf|efrr|kohezij/],
  ["okolis", /okoliš|okolis|zelen[aiu] |klimat|održiv/],
  ["poljoprivreda", /poljoprivred|agronet|ruraln|apprrr/],
  ["hackathon", /hackathon|hakaton|natjecanj|prvenstv|competition/],
  ["sajam", /sajam|sajm|smotr|dan otvorenih/],
  ["karijera", /karijer|poslodav|praks[ae]|zapošljav|zaposljav|career|job/],
  ["mobilnost", /erasmus|mobilnost|razmjen/],
  ["studij", /ispit|upis|studomat|referad/],
  ["psiholoska-podrska", /psihološ|psiholos|stres|savjetovališt|mentaln/],
  ["ukljucivost", /manjin|uključiv|ukljuciv|inkluz/],
  ["kultura", /koncert|izložb|izlozb|kazališ|druženj|zabav|kultur/],
  ["sport", /sport|futsal|nogomet|košark|trčanj|rekreac/],
];

export function guessTags(text: string, max = 3): TagKey[] {
  const t = text.toLowerCase();
  const out: TagKey[] = [];
  for (const [key, re] of KEYWORDS) {
    if (re.test(t)) out.push(key);
    if (out.length >= max) break;
  }
  return out;
}
