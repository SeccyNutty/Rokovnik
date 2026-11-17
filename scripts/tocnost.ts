/**
 * Test točnosti čitanja mailova. Skup: tocnost/mailovi/*.txt, očekivani rezultati: tocnost/ocekivano.json.
 *
 *   pnpm tocnost                       čita sve mailove AI-jem iz .env.local i uspoređuje s očekivanim
 *   pnpm tocnost --pravila             isto, ali bez AI-ja (jednostavna pravila; za usporedbu)
 *   pnpm tocnost --samo 01,04          samo odabrani mailovi
 *
 *   pnpm tocnost posalji <adresa> --od "Ime <adresa@domena>"
 *                                      šalje sve mailove na objavljenu stranicu (potpisano s INBOUND_SECRET)
 *   pnpm tocnost provjeri <adresa> --zajednica <slug> [--nakon 2026-11-20T10:00]
 *                                      uspoređuje ono što je stranica stvarno objavila s očekivanim
 *
 * Izvještaj se sprema u tocnost/rezultati/.
 */
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractItems } from "@/lib/extract";
import { extractWithRules } from "@/lib/extract/heuristic";
import { llmProvider, PROVIDER_LABEL } from "@/lib/extract/provider";
import type { ExtractedItem } from "@/lib/extract/types";
import { dateKey, timeKey, zonedToUtc } from "@/lib/time";

const ROOT = path.join(process.cwd(), "tocnost");
const OUT = path.join(ROOT, "rezultati");

type Expected = {
  vrsta: "dogadaj" | "rok";
  datum: string;
  vrijeme: string | null;
  kraj_datum?: string;
  kraj_vrijeme?: string;
  mjesto?: string[];
  naslov?: string[];
  online?: boolean;
  neobavezno?: boolean;
};
type ExpectedMail = { id: string; datoteka: string; napomena: string; relativno: boolean; stavke: Expected[] };
type Dataset = { primljeno: string; mailovi: ExpectedMail[] };

/** Izvučena stavka u zajedničkom obliku (iz AI-ja ili iz javnog API-ja). */
type Got = {
  vrsta: "dogadaj" | "rok";
  datum: string;
  vrijeme: string | null;
  kraj_datum: string | null;
  kraj_vrijeme: string | null;
  mjesto: string;
  naslov: string;
  online: boolean;
  mail?: string;
};

type FieldCheck = { polje: string; ok: boolean; ocekivano: string; dobiveno: string };
type MailResult = {
  id: string;
  datoteka: string;
  napomena: string;
  ocekivano: number;
  pronadeno: number;
  visak: Got[];
  propusteno: Expected[];
  provjere: FieldCheck[];
  greska?: string;
};

// ── Pomoćne ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const anyIn = (words: string[], text: string) => words.some((w) => norm(text).includes(norm(w)));

function loadDataset(): Dataset {
  return JSON.parse(readFileSync(path.join(ROOT, "ocekivano.json"), "utf8")) as Dataset;
}

function readMail(file: string): { od: string; naslov: string; tekst: string } {
  const raw = readFileSync(path.join(ROOT, "mailovi", file), "utf8").replace(/\r\n/g, "\n");
  const [head, ...rest] = raw.split("\n\n");
  const od = /^Od:\s*(.+)$/m.exec(head)?.[1]?.trim() ?? "";
  const naslov = /^Naslov:\s*(.+)$/m.exec(head)?.[1]?.trim() ?? "";
  return { od, naslov, tekst: rest.join("\n\n").trim() };
}

function fromExtracted(x: ExtractedItem): Got {
  return {
    vrsta: x.kind === "deadline" ? "rok" : "dogadaj",
    datum: x.start_date,
    vrijeme: x.start_time ?? null,
    kraj_datum: x.end_date ?? null,
    kraj_vrijeme: x.end_time ?? null,
    mjesto: x.location ?? "",
    naslov: x.title,
    online: Boolean(x.online_url),
  };
}

// ── Usporedba ────────────────────────────────────────────────────────────────

/** Uparuje očekivane i dobivene stavke: ista vrsta i isti dan. Neobavezne se uparuju samo po danu. */
function compare(expected: Expected[], got: Got[]): Omit<MailResult, "id" | "datoteka" | "napomena"> {
  const free = [...got];
  const take = (pred: (g: Got) => boolean) => {
    const i = free.findIndex(pred);
    return i >= 0 ? free.splice(i, 1)[0] : null;
  };
  const provjere: FieldCheck[] = [];
  const propusteno: Expected[] = [];
  let pronadeno = 0;
  const required = expected.filter((e) => !e.neobavezno);

  for (const e of required) {
    const g = take((x) => x.vrsta === e.vrsta && x.datum === e.datum);
    if (!g) {
      propusteno.push(e);
      continue;
    }
    pronadeno++;
    const check = (polje: string, ok: boolean, ocekivano: string, dobiveno: string) => provjere.push({ polje, ok, ocekivano, dobiveno });
    check("vrijeme", (g.vrijeme ?? null) === (e.vrijeme ?? null), e.vrijeme ?? "bez vremena", g.vrijeme ?? "bez vremena");
    if (e.kraj_datum !== undefined) check("kraj (dan)", g.kraj_datum === e.kraj_datum, e.kraj_datum, g.kraj_datum ?? "—");
    if (e.kraj_vrijeme !== undefined) check("kraj (vrijeme)", g.kraj_vrijeme === e.kraj_vrijeme, e.kraj_vrijeme, g.kraj_vrijeme ?? "—");
    if (e.mjesto) check("mjesto", anyIn(e.mjesto, g.mjesto), e.mjesto.join(" / "), g.mjesto || "—");
    if (e.naslov) check("naslov", anyIn(e.naslov, g.naslov), e.naslov.join(" / "), g.naslov);
    if (e.online) check("online poveznica", g.online, "da", g.online ? "da" : "ne");
  }
  for (const e of expected.filter((x) => x.neobavezno)) take((x) => x.datum === e.datum);
  return { ocekivano: required.length, pronadeno, visak: free, propusteno, provjere };
}

// ── Izvještaj ────────────────────────────────────────────────────────────────

function pct(a: number, b: number) {
  return b ? `${Math.round((a / b) * 100)} %` : "—";
}

function report(results: MailResult[], title: string, note: string): string {
  const expected = results.reduce((n, r) => n + r.ocekivano, 0);
  const found = results.reduce((n, r) => n + r.pronadeno, 0);
  const extra = results.reduce((n, r) => n + r.visak.length, 0);
  const checks = results.flatMap((r) => r.provjere);
  const byField = new Map<string, { ok: number; all: number }>();
  for (const c of checks) {
    const f = byField.get(c.polje) ?? { ok: 0, all: 0 };
    f.all++;
    if (c.ok) f.ok++;
    byField.set(c.polje, f);
  }
  const perfect = results.filter((r) => !r.greska && r.propusteno.length === 0 && r.visak.length === 0 && r.provjere.every((c) => c.ok)).length;

  const lines: string[] = [];
  lines.push(`# ${title}`, "", note, "");
  lines.push("## Sažetak", "");
  lines.push("| Mjera | Rezultat |", "|---|---|");
  lines.push(`| Mailovi potpuno točni | ${perfect} / ${results.length} (${pct(perfect, results.length)}) |`);
  lines.push(`| Pronađene stavke (odziv) | ${found} / ${expected} (${pct(found, expected)}) |`);
  lines.push(`| Stavke bez viška (preciznost) | ${found} / ${found + extra} (${pct(found, found + extra)}) |`);
  for (const [polje, f] of byField) lines.push(`| ${polje[0].toUpperCase()}${polje.slice(1)} točno | ${f.ok} / ${f.all} (${pct(f.ok, f.all)}) |`);
  lines.push("", "Stavka je „pronađena” ako se poklapaju vrsta (događaj ili rok) i dan. Ostala polja provjeravaju se samo na pronađenim stavkama.", "");

  lines.push("## Po mailovima", "");
  for (const r of results) {
    const ok = !r.greska && r.propusteno.length === 0 && r.visak.length === 0 && r.provjere.every((c) => c.ok);
    lines.push(`### ${ok ? "✓" : "✗"} ${r.datoteka}`);
    if (r.napomena) lines.push(`_${r.napomena}_`);
    if (r.greska) lines.push(`- Greška: ${r.greska}`);
    lines.push(`- Pronađeno ${r.pronadeno} / ${r.ocekivano}`);
    for (const e of r.propusteno) lines.push(`- Nedostaje: ${e.vrsta} ${e.datum}${e.vrijeme ? ` ${e.vrijeme}` : ""}`);
    for (const g of r.visak) lines.push(`- Višak: ${g.vrsta} ${g.datum}${g.vrijeme ? ` ${g.vrijeme}` : ""} „${g.naslov}”`);
    for (const c of r.provjere.filter((x) => !x.ok)) lines.push(`- Krivo polje ${c.polje}: očekivano „${c.ocekivano}”, dobiveno „${c.dobiveno}”`);
    lines.push("");
  }
  return lines.join("\n");
}

function save(markdown: string, kind: string) {
  mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const file = path.join(OUT, `${stamp}-${kind}.md`);
  writeFileSync(file, markdown);
  return path.relative(process.cwd(), file);
}

function printSummary(markdown: string, file: string) {
  const summary = markdown.split("## Po mailovima")[0];
  console.log(summary.trim());
  const bad = markdown
    .split("\n")
    .filter((l) => l.startsWith("### ✗"))
    .map((l) => l.replace("### ✗ ", "  ✗ "));
  if (bad.length) console.log(`\nMailovi s greškom:\n${bad.join("\n")}`);
  console.log(`\nCijeli izvještaj: ${file}`);
}

// ── Načini rada ──────────────────────────────────────────────────────────────

async function offline() {
  const data = loadDataset();
  const only = option("--samo")?.split(",").map((s) => s.trim().padStart(2, "0"));
  const rules = flag("--pravila");
  const provider = rules ? null : llmProvider();
  const label = provider ? `AI (${PROVIDER_LABEL[provider]}${provider === "anthropic" ? `, ${process.env.LLM_MODEL || "claude-haiku-5-5"}` : `, ${process.env.GEMINI_MODEL || "gemini-3.6-flash"}`})` : "jednostavna pravila (bez AI-ja)";
  const [day, time] = data.primljeno.split("T");
  const receivedAt = zonedToUtc(day, time);
  const mails = data.mailovi.filter((m) => !only || only.includes(m.id));
  console.log(`Čitam ${mails.length} mailova: ${label}. Datum primitka: ${day} ${time}.\n`);

  const results: MailResult[] = [];
  for (const m of mails) {
    const mail = readMail(m.datoteka);
    process.stdout.write(`  ${m.datoteka} … `);
    try {
      const input = { subject: mail.naslov, text: mail.tekst, receivedAt };
      const out = rules ? await extractWithRules(input) : await extractItems(input);
      const r = { id: m.id, datoteka: m.datoteka, napomena: m.napomena, ...compare(m.stavke, out.items.map(fromExtracted)) };
      results.push(r);
      const ok = r.propusteno.length === 0 && r.visak.length === 0 && r.provjere.every((c) => c.ok);
      console.log(ok ? "točno" : `${r.pronadeno}/${r.ocekivano}, višak ${r.visak.length}, krivih polja ${r.provjere.filter((c) => !c.ok).length}`);
    } catch (e) {
      const greska = e instanceof Error ? e.message : String(e);
      results.push({ id: m.id, datoteka: m.datoteka, napomena: m.napomena, ocekivano: m.stavke.filter((s) => !s.neobavezno).length, pronadeno: 0, visak: [], propusteno: m.stavke.filter((s) => !s.neobavezno), provjere: [], greska });
      console.log(`GREŠKA: ${greska}`);
    }
  }
  const md = report(results, `Točnost čitanja: ${label}`, `Pokrenuto ${new Date().toLocaleString("hr-HR")}. Mailovi se čitaju izravno, bez slanja; datum primitka je ${day} ${time} (Europe/Zagreb).`);
  console.log("");
  printSummary(md, save(md, rules ? "pravila" : (provider ?? "pravila")));
}

async function send() {
  const base = (args[1] ?? "").replace(/\/+$/, "");
  const from = option("--od");
  const secret = process.env.INBOUND_SECRET;
  if (!/^https?:\/\//.test(base) || !from) throw new Error('Upotreba: pnpm tocnost posalji https://tvoja-adresa --od "Ime <adresa@domena>"');
  if (!secret) throw new Error("INBOUND_SECRET nije postavljen (upiši ga u .env.local, isti kao na Netlifyju).");
  const data = loadDataset();
  const startedAt = new Date().toISOString();
  console.log(`Šaljem ${data.mailovi.length} mailova na ${base} kao ${from}.\n`);
  for (const m of data.mailovi) {
    const mail = readMail(m.datoteka);
    const body = JSON.stringify({
      messageId: `tocnost-${m.id}-${Date.now()}`,
      from,
      subject: mail.naslov,
      text: mail.tekst,
      date: new Date().toISOString(),
      auth: { spf: "pass", dkim: "pass", dmarc: "pass" },
      // Bez povratnih poruka: 27 automatskih odgovora na testnu adresu nikome ne treba.
      automated: true,
    });
    const sig = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    const res = await fetch(`${base}/api/inbound/generic`, { method: "POST", body, headers: { "content-type": "application/json", "x-signature": sig } });
    const out = (await res.json().catch(() => ({}))) as { status?: string; items?: number; error?: string };
    console.log(`  ${m.datoteka.padEnd(36)} ${res.status} ${out.status ?? out.error ?? ""}${out.items ? ` (${out.items} stavki)` : ""}`);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, ".slanje.json"), JSON.stringify({ base, from, startedAt }, null, 2));
  console.log(
    `\nGotovo. Ako je ovo prvi mail s te adrese, u /admin potvrdi novu zajednicu i pričekaj minutu.` +
      `\nZatim: pnpm tocnost provjeri ${base} --zajednica <adresa-zajednice>`,
  );
}

async function check() {
  const base = (args[1] ?? "").replace(/\/+$/, "");
  const slug = option("--zajednica");
  if (!/^https?:\/\//.test(base) || !slug) throw new Error("Upotreba: pnpm tocnost provjeri https://tvoja-adresa --zajednica <slug> [--nakon 2026-11-20T10:00]");
  let after = option("--nakon");
  if (!after) {
    try {
      after = (JSON.parse(readFileSync(path.join(OUT, ".slanje.json"), "utf8")) as { startedAt: string }).startedAt;
    } catch {
      /* bez filtra */
    }
  }
  const afterMs = after ? new Date(after).getTime() - 60_000 : 0;
  const data = loadDataset();
  const mails = data.mailovi.filter((m) => !m.relativno);
  type ApiItem = { vrsta: "rok" | "dogadaj"; naslov: string; pocetak: string; kraj: string | null; cijeliDan: boolean; mjesto: string | null; online: string | null; azurirano: string };
  // Više zajednica odvojenih zarezom: proslijeđeni mail završi u zajednici izvornog pošiljatelja.
  const all: ApiItem[] = [];
  for (const s of slug.split(",").map((x) => x.trim()).filter(Boolean)) {
    const res = await fetch(`${base}/api/v1/zajednice/${encodeURIComponent(s)}/stavke?od=2026-11-01&broj=200`);
    if (!res.ok) throw new Error(`Stranica je vratila ${res.status}. Postoji li zajednica „${s}”?`);
    all.push(...((await res.json()) as { stavke: ApiItem[] }).stavke);
  }
  const published: Got[] = all
    .filter((s) => new Date(s.azurirano).getTime() >= afterMs)
    .map((s) => {
      const start = new Date(s.pocetak);
      const end = s.kraj ? new Date(s.kraj) : null;
      return {
        vrsta: s.vrsta,
        datum: dateKey(start),
        vrijeme: s.cijeliDan ? null : timeKey(start),
        kraj_datum: end ? dateKey(end) : null,
        kraj_vrijeme: end && !s.cijeliDan ? timeKey(end) : null,
        mjesto: s.mjesto ?? "",
        naslov: s.naslov,
        online: Boolean(s.online),
      };
    });
  console.log(`Na stranici: ${published.length} stavki u zajednici ${slug}${after ? ` (izmijenjene nakon ${after})` : ""}.\n`);

  // Sve stavke su u jednoj zajednici, pa se uparuju na razini cijelog skupa, mail po mail.
  const pool = [...published];
  const results: MailResult[] = [];
  for (const m of mails) {
    const r = compare(m.stavke, pool);
    // compare() troši kopiju; ovdje uklanjamo uparene iz zajedničkog skupa.
    const used = pool.filter((g) => !r.visak.includes(g));
    for (const g of used) pool.splice(pool.indexOf(g), 1);
    results.push({ id: m.id, datoteka: m.datoteka, napomena: m.napomena, ...r, visak: [] });
  }
  if (pool.length) results.push({ id: "--", datoteka: "(stavke koje ne odgovaraju nijednom mailu)", napomena: "", ocekivano: 0, pronadeno: 0, visak: pool, propusteno: [], provjere: [] });
  const md = report(
    results,
    `Točnost objave na ${base}`,
    `Provjereno ${new Date().toLocaleString("hr-HR")}, zajednica ${slug}. Mailovi s relativnim datumima („sutra”, „u petak”, bez godine) preskočeni su jer ovise o danu slanja.`,
  );
  printSummary(md, save(md, "stranica"));
}

async function main() {
  const mode = args[0];
  if (mode === "posalji") return send();
  if (mode === "provjeri") return check();
  return offline();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

