# Rokovnik

Događaji i rokovi zajednica na jednom mjestu. Organizacija objavljuje tako da **pošalje običan mail**; sustav ga prema domeni pošiljatelja svrsta u zajednicu, iz teksta izvuče događaje i rokove i **objavi ih automatski**. Posjetitelji ih prate na webu ili ih jednim klikom dodaju u svoj kalendar.

Radni naziv projekta bio je „Publish.me”. Ime se mijenja na jednom mjestu: `NEXT_PUBLIC_APP_NAME` (ili `src/lib/config.ts`).

## Kako radi

```mermaid
flowchart LR
  M[Mail organizacije] --> W[Webhook /api/inbound/resend]
  W --> A{Pošiljatelj potvrđen?<br/>SPF / DKIM / DMARC}
  A -- ne --> X[Ne objavljuje se]
  A -- da --> D{Domena ima zajednicu?}
  D -- da --> E[AI izvlači događaje i rokove]
  D -- ne --> R[Zahtjev za novu zajednicu]
  R -->|administrator potvrdi jednim klikom| E
  E --> P[Objavljeno]
  P --> K[Web: popis i mjesec]
  P --> I[ICS pretplata]
  P --> U[Ugradnja na web organizacije]
```

- **Svrstavanje po domeni.** Mail s `@fsb.unizg.hr` ide u zajednicu vezanu uz tu domenu. Za javne servise (gmail.com i slične) pravilo se veže uz točnu adresu. Poddomene se ne svrstavaju automatski pod širu domenu: za njih nastaje zahtjev, uz podsjetnik da slična domena već ima zajednicu.
- **Nova zajednica.** Prvi mail s nepoznate domene otvara zahtjev. Administrator dobije mail s poveznicom (ili ga vidi u `/admin`) i samo potvrdi predloženo ime. Mailovi koji su čekali tada se obrade i objave, a svi budući s te domene idu bez potvrde. Odbijen pošiljatelj ostaje blokiran.
- **Prosljeđivanje.** Kad povjerljiva adresa (`ADMIN_EMAIL`, `FORWARDER_EMAILS`) proslijedi tuđi mail, zajednica se određuje prema izvornom pošiljatelju iz proslijeđene poruke.
- **Bez ručnog odobravanja objava.** Objave idu van odmah. Administrator ih naknadno može sakriti ili ponovno obraditi mail.
- **Ispravak.** Novi mail s istim naslovom i datumom ažurira postojeću objavu; pretplaćeni kalendari je ažuriraju, ne dupliciraju (stabilan UID, rastući SEQUENCE).

## Što posjetitelj dobiva

- **Popis po danima** (zadani prikaz, prilagođen mobitelu) i **mjesec**; filtar *sve / događaji / rokovi*. Rokovi su istaknuti crvenom.
- **Klik na događaj otvara opis**, a na dnu je **„Dodaj u moj kalendar”** (Google, Outlook.com, Microsoft 365, Apple i ostali preko .ics). Izbor aplikacije se pamti, pa je svako sljedeće dodavanje jedan klik.
- **„Prati u svom kalendaru”**: pretplata na cijeli kalendar zajednice (ICS). Nema integracije s pojedinim kalendarima; koristi se adresa za pretplatu koju svi podržavaju.
- **Moj kalendar** (račun putem Googlea): praćene zajednice i pojedinačno dodani događaji u jednom kalendaru, na svim uređajima, s tajnom osobnom pretplatom (ICS). Gost koji klikne „Dodaj u Moj kalendar” ili „Zaprati zajednicu” dobiva poziv na prijavu, a nakon prijave radnja je već izvršena.

## Računi

Tri vrste: **korisnik** (Moj kalendar), **organizacija** (upravlja svojom zajednicom na `/organizacija`) i **administrator** (`/admin`). Prijava je putem Googlea (OpenID Connect s PKCE-om, provjera potpisa tokena), uloge se provjeravaju u bazi pri svakoj radnji. Postavljanje: [DEPLOY.md](DEPLOY.md), korak 7.

## Sigurnost objave

- Automatski se objavljuje samo mail čija je domena dokazana (DMARC); pala provjera se odbija, a mail bez dokaza čeka ručnu odluku.
- Po zajednici: blaža provjera (SPF + DKIM) za domene bez DMARC-a i način „samo dopuštene adrese”.
- Povratna poruka objavitelju: objavljeno (s popisom i poveznicom na zajednicu), nije pronađen datum, ili čeka potvrdu.
- Ograničenja učestalosti u bazi, dnevnik radnji, istek poveznica za potvrdu (30 dana), stroga sigurnosna zaglavlja (CSP, HSTS), RLS na svim tablicama.

## Konektor za stranice organizacija

Organizacija kalendar svoje zajednice stavlja na vlastitu domenu jednim retkom koda. Kôd se slaže na `/z/<zajednica>/ugradi` (izbor postavki, pregled uživo, gumb za kopiranje):

```html
<script async src="https://<rokovnik>/widget.js" data-rokovnik="fsb"></script>
```

- Visina se sama prilagođava sadržaju; nove objave stižu bez ikakve izmjene na stranici organizacije.
- Postavke: `data-prikaz="mjesec"`, `data-vrsta="rokovi|dogadaji"`, `data-broj`, `data-kontrole="ne"`, `data-tema="tamna"`, `data-boja="#rrggbb"`, `data-visina`.
- Bez skripti: obični `<iframe src="https://<rokovnik>/ugradi/fsb">`.
- Vlastiti dizajn: javni JSON API, `GET /api/v1/zajednice` i `GET /api/v1/zajednice/<zajednica>/stavke?vrsta=&od=&do=&broj=` (CORS otvoren, samo čitanje).

## Lokalno pokretanje

Treba samo Node 22 i pnpm. Baza, AI ključ i mail **nisu potrebni**:

```bash
pnpm install
pnpm db:seed      # tri zajednice s izmišljenim objavama (samo lokalno)
pnpm dev          # http://localhost:3000
```

- Bez `DATABASE_URL` koristi se ugrađeni Postgres (PGlite) u mapi `.data/`.
- Bez `ANTHROPIC_API_KEY` mailovi se čitaju jednostavnim pravilima (hrvatski zapisi datuma i vremena). Dovoljno za isprobavanje, ali za stvarne okružnice treba AI.
- Administracija: `/admin`, lokalna lozinka je `rokovnik`. Tamo je i obrazac **Testni mail**, koji prolazi istu obradu kao pravi mail.

Testni mail iz terminala, kroz HTTP ulaz:

```bash
INBOUND_SECRET=tajna pnpm dev
INBOUND_SECRET=tajna pnpm mail:test --from "Okružnica <okruznica@fsb.unizg.hr>" \
  --subject "Gostujuće predavanje" --text "Predavanje je 15. 12. 2026. u 14:15 u dvorani A. Prijave do 10. 12."
```

## Provjere

Tri razine, svaka jednom naredbom:

```bash
pnpm test          # logika: vrijeme, svrstavanje pošiljatelja, prosljeđivanje, ICS, potpisi, cijeli tok maila
pnpm test:e2e      # preglednik: sve funkcije kao što ih vidi korisnik, na računalu i na mobitelu
pnpm smoke https://tvoja-adresa   # objavljena stranica: radi li sve i koliko brzo (samo čita)
pnpm test:all      # lint + tipovi + test + test:e2e
pnpm tocnost       # točnost čitanja mailova na 27 primjera (vidi tocnost/README.md)
```

- **`pnpm test:e2e`** sam izgradi i pokrene aplikaciju s praznom ugrađenom bazom i bez AI-ja, pa ne dira pravu bazu, ne šalje mailove i ništa ne naplaćuje (i kad postoji `.env.local`). Prvi put treba preglednik: `pnpm exec playwright install chromium`. Izvještaj s koracima i snimkama grešaka: `pnpm exec playwright show-report`.
- Pokriva: mail nepoznate organizacije → zahtjev → potvrda → objava; sljedeći mail bez potvrde; duplikate; odbijanje pošiljatelja; sakrivanje objave; filtre i mjesec; opis događaja i poveznice za kalendare; računi i uloge (prijava putem lažnog Googlea, samo u testovima), poziv gostu na prijavu, lažirani pošiljatelj i ručna odluka, krivotvoreni kolačić i preusmjeravanje; Moj kalendar; ICS; widget na tuđoj stranici (automatska visina, postavke); JSON API; sigurnosna zaglavlja; izgled bez vodoravnog klizača.
- Testovi cijelog toka u `tests/pipeline.test.ts` rade nad pravom Postgres shemom u memoriji, s lažnim AI odgovorom.

Stanje i plan: [ROADMAP.md](ROADMAP.md).

## Postavljanje online

Upute korak po korak: [DEPLOY.md](DEPLOY.md). Sve postavke: [.env.example](.env.example).

## Struktura

| Putanja | Sadržaj |
|---|---|
| `src/lib/pipeline.ts` | Tok maila: provjera pošiljatelja, zajednica, zahtjev, izvlačenje, objava |
| `src/lib/sender.ts` | Domene, javni mail servisi, prepoznavanje proslijeđene poruke |
| `src/lib/extract/` | Izvlačenje: `llm.ts` (Claude API, strukturirani izlaz), `heuristic.ts` (pravila bez AI-ja) |
| `src/lib/ics.ts`, `calendar-links.ts` | ICS (RFC 5545) i poveznice „Dodaj u kalendar” |
| `src/lib/resend.ts` | Primanje (webhook, dohvat maila i privitaka) i slanje maila |
| `src/db/schema.ts`, `drizzle/` | Shema i migracije (Drizzle) |
| `src/app/(site)/` | Stranice: početna, `/z/<zajednica>`, `/d/<objava>`, `/moj`, `/objavi`, `/admin`, `/potvrdi/<token>` |
| `src/app/ics/`, `src/app/ugradi/`, `src/app/api/` | Kalendari za pretplatu, ugradnja, webhookovi |

## Odluke

- **Next.js + Postgres preko Drizzlea**, bez vezanja uz jednog pružatelja: ista aplikacija radi na Supabaseu, Neonu ili lokalno na PGliteu.
- **Resend za primanje maila** umjesto vlastitog mail poslužitelja: daje gotovu adresu `…@<id>.resend.app`, pa za prve testove ne treba ni vlastita domena.
- **Bez korisničkih računa** u ovoj fazi: praćenje ide preko pretplate na kalendar i izbora na uređaju. Jedini račun je administratorski (lozinka + potpisani kolačić).
- **Poveznica za potvrdu zajednice** je potpisana (HMAC) i vodi na stranicu s gumbom; sama poveznica ništa ne mijenja, da je čitači maila ne „potvrde” slučajno.
- **Sadržaj maila je nepovjerljiv ulaz**: AI dobiva izričitu uputu da ne slijedi upute iz maila, izlaz je strogo strukturiran i provjeren (zod), poveznice smiju biti samo http(s), a tekst se prikazuje kao običan tekst.

## Što još nije izgrađeno

Vidi [ROADMAP.md](ROADMAP.md).
