/**
 * Brza provjera objavljene stranice (samo čita, ništa ne mijenja):
 *   pnpm smoke https://rokovnikhr.netlify.app
 * Provjerava da sve javne stranice, kalendari, API i widget odgovaraju, i mjeri koliko brzo.
 * Izlazni kôd 1 ako nešto ne radi, pa se može koristiti i u automatizaciji.
 */
const base = (process.argv[2] ?? process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const RUNS = 3;
const SLOW_MS = 1200;

type Check = { name: string; path: string; expect?: (res: Response, body: string) => string | null };

const contains = (needle: string) => (_: Response, body: string) => (body.includes(needle) ? null : `nedostaje "${needle}"`);
const header = (name: string, part: string) => (res: Response) =>
  (res.headers.get(name) ?? "").includes(part) ? null : `zaglavlje ${name} nema "${part}" (ima "${res.headers.get(name) ?? ""}")`;

async function timed(path: string): Promise<{ res: Response; body: string; ms: number }> {
  const t = performance.now();
  const res = await fetch(base + path, { redirect: "manual", headers: { "user-agent": "rokovnik-smoke" } });
  const body = await res.text();
  return { res, body, ms: Math.round(performance.now() - t) };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function main() {
  console.log(`\nRokovnik smoke: ${base}\n`);
  let failed = 0;
  const row = (ok: boolean, name: string, info: string) => console.log(`${ok ? "  OK  " : " GREŠKA"}  ${name.padEnd(34)} ${info}`);

  // 1. Zdravlje i udaljenost baze
  let slug: string | null = null;
  try {
    const { res, body } = await timed("/api/health");
    const h = JSON.parse(body) as { ok?: boolean; bazaMs?: number; izvlacenje?: string; pogon?: string };
    const ok = res.status === 200 && h.ok === true;
    if (!ok) failed++;
    row(ok, "zdravlje (/api/health)", `baza ${h.pogon ?? "?"}, upit ${h.bazaMs ?? "?"} ms, čitanje mailova: ${h.izvlacenje ?? "?"}`);
    if (typeof h.bazaMs === "number" && h.bazaMs > 60) {
      console.log(`         ↳ Jedan upit traje ${h.bazaMs} ms: poslužitelj i baza vjerojatno nisu u istoj regiji (vidi DEPLOY.md, "Brzina").`);
    }
  } catch (e) {
    failed++;
    row(false, "zdravlje (/api/health)", String(e));
  }

  // 2. Prva zajednica (ako postoji) za provjere koje je trebaju
  try {
    const { body } = await timed("/api/v1/zajednice");
    const list = (JSON.parse(body) as { zajednice: { adresa: string }[] }).zajednice;
    slug = list[0]?.adresa ?? null;
    row(true, "API: popis zajednica", `${list.length} zajednica`);
  } catch (e) {
    failed++;
    row(false, "API: popis zajednica", String(e));
  }

  const checks: Check[] = [
    { name: "naslovnica", path: "/", expect: contains("Rokovnik") },
    { name: "moj kalendar", path: "/moj", expect: contains("Moj kalendar") },
    { name: "kako objaviti", path: "/objavi", expect: contains("Objava je običan mail") },
    { name: "privatnost", path: "/privatnost" },
    { name: "prijava u administraciju", path: "/admin/prijava", expect: contains("Lozinka") },
    { name: "kalendar svih zajednica (ICS)", path: "/ics/sve.ics", expect: contains("BEGIN:VCALENDAR") },
    { name: "widget.js", path: "/widget.js", expect: header("content-type", "javascript") },
    { name: "zaštita od ugradnje (naslovnica)", path: "/", expect: header("x-frame-options", "SAMEORIGIN") },
  ];
  if (slug) {
    checks.push(
      { name: `zajednica /z/${slug}`, path: `/z/${slug}` },
      { name: "zajednica: mjesec", path: `/z/${slug}?prikaz=mjesec`, expect: contains("month__grid") },
      { name: "kalendar zajednice (ICS)", path: `/ics/${slug}.ics`, expect: contains("BEGIN:VCALENDAR") },
      { name: "ugrađeni kalendar", path: `/ugradi/${slug}`, expect: header("content-security-policy", "frame-ancestors") },
      { name: "slaganje widgeta", path: `/z/${slug}/ugradi`, expect: contains("widget.js") },
      { name: "API: stavke zajednice", path: `/api/v1/zajednice/${slug}/stavke`, expect: header("access-control-allow-origin", "*") },
    );
  } else {
    console.log("         (još nema zajednica: provjere stranice zajednice, widgeta i API-ja stavki su preskočene)");
  }

  const times: number[] = [];
  for (const c of checks) {
    try {
      const runs = [];
      for (let i = 0; i < RUNS; i++) runs.push(await timed(c.path));
      const last = runs[runs.length - 1];
      const ms = median(runs.map((r) => r.ms));
      const problem = last.res.status !== 200 ? `status ${last.res.status}` : (c.expect?.(last.res, last.body) ?? null);
      if (problem) failed++;
      else times.push(ms);
      row(!problem, c.name, problem ?? `${ms} ms (prvi put ${runs[0].ms} ms)${ms > SLOW_MS ? "  ← sporo" : ""}`);
    } catch (e) {
      failed++;
      row(false, c.name, String(e));
    }
  }

  // 3. Zaštite: ono što NE smije raditi
  try {
    const admin = await timed("/admin");
    const ok = admin.res.status >= 300 && admin.res.status < 400;
    if (!ok) failed++;
    row(ok, "administracija traži prijavu", ok ? "preusmjerava na prijavu" : `status ${admin.res.status}`);
    const res = await fetch(base + "/api/inbound/generic", { method: "POST", body: "{}", headers: { "content-type": "application/json", "x-signature": "sha256=00" } });
    const rejected = res.status === 401 || res.status === 503;
    if (!rejected) failed++;
    row(rejected, "nepotpisan mail se odbija", `status ${res.status}`);
  } catch (e) {
    failed++;
    row(false, "zaštite", String(e));
  }

  if (times.length) console.log(`\nMedijan odgovora: ${median(times)} ms · najsporije: ${Math.max(...times)} ms (mjereno s ovog računala, ${RUNS} pokušaja po stranici)`);
  console.log(failed ? `\n${failed} provjera NIJE prošlo.\n` : "\nSve provjere su prošle.\n");
  process.exit(failed ? 1 : 0);
}

main();
