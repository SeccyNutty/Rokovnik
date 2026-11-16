/**
 * Određivanje pošiljatelja i zajednice.
 *
 * Pravilo: mail se svrstava u zajednicu prema domeni pošiljatelja. Za javne
 * mail servise (gmail.com…) domena ništa ne govori o organizaciji, pa se za njih
 * pravilo veže uz točnu adresu.
 */

export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com",
  "aol.com", "gmx.com", "gmx.net", "mail.com", "zoho.com", "yandex.com", "fastmail.com",
  "net.hr", "inet.hr", "t-com.hr", "ht.hr", "vip.hr", "optinet.hr", "globalnet.hr", "zg.t-com.hr",
]);

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i;

export function normalizeAddress(raw: string): string {
  const m = EMAIL_RE.exec(raw ?? "");
  return (m ? m[0] : (raw ?? "")).trim().toLowerCase();
}

/** "Ime Prezime <a@b.hr>" → { name, address } */
export function parseMailbox(raw: string): { name: string; address: string } {
  const address = normalizeAddress(raw);
  let name = (raw ?? "").replace(/<[^>]*>/g, "").replace(EMAIL_RE, "").trim();
  name = name.replace(/^["']+|["']+$/g, "").trim();
  return { name, address };
}

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).toLowerCase();
}

/** Ključ pod kojim tražimo pravilo ili otvaramo zahtjev za novu zajednicu. */
export function requestKeyFor(address: string): { kind: "domain" | "address"; value: string } {
  const domain = domainOf(address);
  if (!domain || FREE_MAIL_DOMAINS.has(domain)) return { kind: "address", value: address };
  return { kind: "domain", value: domain };
}

/**
 * Domene po kojima tražimo pravilo, od najuže prema široj:
 * stud.fsb.unizg.hr → [stud.fsb.unizg.hr, fsb.unizg.hr, unizg.hr]
 */
export function candidateDomains(domain: string): string[] {
  if (!domain || FREE_MAIL_DOMAINS.has(domain)) return [];
  const labels = domain.split(".");
  const out: string[] = [];
  for (let i = 0; i <= labels.length - 2; i++) out.push(labels.slice(i).join("."));
  return out;
}

const DIACRITICS: Record<string, string> = { č: "c", ć: "c", đ: "d", š: "s", ž: "z" };

export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/[čćđšž]/g, (c) => DIACRITICS[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s || "zajednica";
}

/** Prijedlog imena zajednice: fsb.unizg.hr → "FSB", grad.zagreb.hr → "Grad", ime pošiljatelja za privatne adrese. */
export function suggestCommunityName(
  key: { kind: "domain" | "address"; value: string },
  displayName = "",
): string {
  if (key.kind === "address") {
    if (displayName) return displayName;
    const local = key.value.split("@")[0] ?? key.value;
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  const first = key.value.split(".")[0] ?? key.value;
  if (first.length <= 5) return first.toUpperCase();
  return first
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export type ForwardedOriginal = { address: string; name: string; subject: string | null };

const FWD_MARKER =
  /-{2,}\s*(?:forwarded message|proslije[đd]ena poruka|izvorna poruka|original message|originalna poruka)\s*-{2,}/i;
const FROM_LINE = /^\s*>?\s*(?:from|od|šalje|salje|pošiljatelj|posiljatelj)\s*:\s*(.+)$/im;
const SUBJECT_LINE = /^\s*>?\s*(?:subject|predmet|naslov)\s*:\s*(.+)$/im;

/**
 * Pronalazi izvornog pošiljatelja u proslijeđenoj poruci (Gmail, Outlook, Apple Mail;
 * hrvatsko i englesko sučelje). Vraća null ako poruka nije proslijeđena.
 */
export function findForwardedOriginal(text: string): ForwardedOriginal | null {
  if (!text) return null;
  const marker = FWD_MARKER.exec(text);
  // Outlook često nema crtice, samo blok "From: / Sent: / To: / Subject:".
  const scope = marker ? text.slice(marker.index) : text;
  const head = scope.slice(0, 1500);
  const from = FROM_LINE.exec(head);
  if (!from) return null;
  if (!marker && !/^\s*>?\s*(?:sent|poslano|date|datum)\s*:/im.test(head)) return null;
  const box = parseMailbox(from[1]);
  if (!box.address.includes("@")) return null;
  const subject = SUBJECT_LINE.exec(head);
  return { address: box.address, name: box.name, subject: subject ? subject[1].trim() : null };
}

/** Uklanja "Fwd:", "FW:", "Re:", "Prosl.:" s početka naslova. */
export function cleanSubject(subject: string): string {
  let s = (subject ?? "").trim();
  for (let i = 0; i < 5; i++) {
    const next = s.replace(/^(?:fwd?|fw|re|prosl|proslije[đd]eno|odg)\s*\.?\s*:\s*/i, "");
    if (next === s) break;
    s = next;
  }
  return s.trim();
}

const HEADER_LINE = /^\s*>?\s*(?:from|od|šalje|salje|pošiljatelj|posiljatelj|date|datum|sent|poslano|subject|predmet|naslov|to|prima|za|cc|kopija)\s*:/i;

/**
 * Tekst izvorne poruke bez bilješke prosljeđivača i bez zaglavlja
 * "Forwarded message / From / Date / Subject / To". Ako poruka nije proslijeđena, vraća je netaknutu.
 */
export function stripForwardHeader(text: string): string {
  if (!findForwardedOriginal(text)) return text;
  const lines = text.split(/\r?\n/);
  let i = lines.findIndex((l) => FWD_MARKER.test(l));
  if (i === -1) i = lines.findIndex((l) => FROM_LINE.test(l)) - 1;
  i += 1;
  while (i < lines.length && (HEADER_LINE.test(lines[i]) || lines[i].trim() === "")) i += 1;
  return lines.slice(i).join("\n").trim();
}
