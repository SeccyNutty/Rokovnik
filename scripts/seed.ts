/**
 * Primjeri podataka za lokalni razvoj: tri zajednice s izmišljenim objavama.
 * Namjerno ne radi na pravoj bazi (DATABASE_URL), da izmišljene objave ne završe javno.
 * Pokreni: pnpm db:seed
 */
import { getDb } from "@/db";
import { items, senderRules } from "@/db/schema";
import { createCommunity } from "@/lib/pipeline";
import { slugify } from "@/lib/sender";
import { addDays, dateKey, zonedToUtc } from "@/lib/time";

type Seed = {
  kind: "event" | "deadline";
  title: string;
  inDays: number;
  time?: string;
  end?: string;
  endInDays?: number;
  location?: string;
  category: string;
  summary: string;
  registrationUrl?: string;
};

const FSB: Seed[] = [
  { kind: "event", title: "Gostujuće predavanje: Suradnička robotika u malim pogonima", inDays: 0, time: "14:15", end: "15:45", location: "Dvorana A, sjeverna zgrada", category: "lecture", summary: "Kako mali pogoni uvode kobote bez zaustavljanja proizvodnje. Predavanje je otvoreno za sve studente." },
  { kind: "deadline", title: "Prijava na radionicu 3D ispisa metala", inDays: 1, category: "workshop", summary: "Broj mjesta je ograničen na 20. Prijava putem obrasca.", registrationUrl: "https://example.org/prijava" },
  { kind: "event", title: "Radionica 3D ispisa metala", inDays: 4, time: "17:00", end: "19:30", location: "Laboratorij za aditivne tehnologije", category: "workshop", summary: "Praktična radionica: od modela do gotovog dijela." },
  { kind: "event", title: "Smotra studentskih timova", inDays: 6, time: "10:00", end: "14:00", location: "Aula", category: "fair", summary: "Formula Student, bespilotne letjelice, robotika i drugi timovi predstavljaju projekte i primaju nove članove." },
  { kind: "deadline", title: "Prijava tima na hackathon „Pametna tvornica”", inDays: 9, time: "12:00", category: "hackathon", summary: "Timovi od 3 do 5 članova. Prijava zatvara u podne.", registrationUrl: "https://example.org/hackathon" },
  { kind: "event", title: "Hackathon „Pametna tvornica”", inDays: 18, endInDays: 19, location: "Knjižnica, 2. kat", category: "hackathon", summary: "24 sata, stvarni podaci iz proizvodnje, nagrade za tri najbolja rješenja." },
  { kind: "event", title: "Karijerni razgovori s inženjerima iz industrije", inDays: 24, time: "16:00", end: "18:00", location: "Vijećnica", category: "social", summary: "Kratki razgovori jedan na jedan. Ponesi životopis." },
];

const UNIZG: Seed[] = [
  { kind: "deadline", title: "Prijava za Erasmus+ studijski boravak (ljetni semestar)", inDays: 3, category: "call", summary: "Natječaj za mobilnost studenata. Prijave se predaju elektronički.", registrationUrl: "https://example.org/erasmus" },
  { kind: "event", title: "Informativni dan o studentskoj razmjeni", inDays: 1, time: "12:00", end: "13:30", location: "Aula Rektorata", category: "lecture", summary: "Iskustva studenata i odgovori na pitanja o prijavi, stipendiji i priznavanju ECTS bodova." },
  { kind: "deadline", title: "Prijava radova za Rektorovu nagradu", inDays: 30, category: "competition", summary: "Radovi se prijavljuju preko mentora i sastavnice." },
  { kind: "event", title: "Radionica: Kako napisati motivacijsko pismo", inDays: 8, time: "18:00", end: "19:30", location: "Online", category: "workshop", summary: "Centar za savjetovanje studenata. Besplatno, uz prijavu." },
];

const GRAD: Seed[] = [
  { kind: "deadline", title: "Stipendija Grada za izvrsnost: predaja prijava", inDays: 12, category: "scholarship", summary: "Za redovite studente s prebivalištem u gradu. Dokumentacija se predaje preko sustava eStipendije." },
  { kind: "event", title: "Besplatni tečaj njemačkog za početnike (prvi termin)", inDays: 5, time: "18:30", end: "20:00", location: "Pučko otvoreno učilište", category: "workshop", summary: "Tečaj u sklopu programa cjeloživotnog učenja. Deset termina." },
  { kind: "event", title: "Radionica: Upravljanje stresom u ispitnim rokovima", inDays: 11, time: "17:00", end: "18:30", location: "Centar za mlade", category: "workshop", summary: "Vodi psihologinja savjetovališta. Broj mjesta ograničen." },
  { kind: "deadline", title: "Javni poziv za financiranje projekata udruga mladih", inDays: 21, time: "15:00", category: "call", summary: "Prijave se zaprimaju do 15 sati zadnjeg dana roka." },
];

async function main() {
  if (process.env.DATABASE_URL && !process.argv.includes("--force")) {
    console.error("Seed je samo za lokalni razvoj. S DATABASE_URL se ne pokreće (izmišljene objave ne smiju na javnu bazu).");
    process.exit(1);
  }
  const db = await getDb();
  const today = dateKey(new Date());
  const groups: [string, string, string, string, Seed[]][] = [
    ["FSB", "fsb", "fsb.unizg.hr", "Fakultet strojarstva i brodogradnje: predavanja, radionice i rokovi. (Primjer podataka.)", FSB],
    ["Sveučilište u Zagrebu", "unizg", "unizg.hr", "Događanja i natječaji za sve sastavnice. (Primjer podataka.)", UNIZG],
    ["Grad Zagreb", "grad-zagreb", "zagreb.hr", "Stipendije, radionice i javni pozivi. (Primjer podataka.)", GRAD],
  ];
  for (const [name, slug, domain, description, seeds] of groups) {
    const community = await createCommunity({ name, slug, description });
    await db.insert(senderRules).values({ communityId: community.id, kind: "domain", value: domain }).onConflictDoNothing();
    for (const s of seeds) {
      const startKey = addDays(today, s.inDays);
      const endsAt = s.end ? zonedToUtc(startKey, s.end) : s.endInDays ? zonedToUtc(addDays(today, s.endInDays)) : null;
      await db.insert(items).values({
        communityId: community.id,
        kind: s.kind,
        title: s.title,
        summary: s.summary,
        description: s.summary,
        startsAt: zonedToUtc(startKey, s.time ?? null),
        endsAt,
        allDay: !s.time,
        location: s.location ?? null,
        registrationUrl: s.registrationUrl ?? null,
        organizer: name,
        category: s.category,
        dedupeKey: `${s.kind}|${startKey}|${slugify(s.title).slice(0, 60)}`,
      });
    }
    console.log(`${name}: ${seeds.length} objava`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
