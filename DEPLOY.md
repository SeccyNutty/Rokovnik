# Postavljanje online

Četiri računa i oko pola sata. Supabase, Resend i Netlify imaju besplatnu razinu; AI (Anthropic) se plaća po korištenju, za pilot u centima. Redoslijed je bitan samo utoliko što zadnji korak (webhook) treba adresu aplikacije.

## 1. Baza: Supabase

Ovdje se čuvaju zajednice, objave, primljeni mailovi i zahtjevi. Aplikacija se na bazu spaja isključivo s poslužitelja, običnim Postgres spojem; Supabase API, `anon` ključ i `service_role` ključ ne koriste se i ne treba ih nigdje upisivati.

### 1.1 Napravi projekt

1. Otvori [supabase.com](https://supabase.com) → **Start your project** i prijavi se (može GitHub računom).
2. **New project**, pa ispuni:
   - **Name**: `rokovnik`
   - **Database Password**: klikni **Generate a password** i **odmah ga spremi** (npr. u upravitelj lozinki). Prikazuje se samo jednom. Ako ga izgubiš, postavi novi u *Project Settings → Database → Database password → Reset*.
   - **Region**: **Central EU (Frankfurt)** — najbliže Hrvatskoj, pa je baza brža.
   - **Plan**: Free.
3. **Create new project**. Priprema traje oko minutu.

### 1.2 Kopiraj connection string

1. U projektu klikni **Connect** (gumb pri vrhu stranice).
2. Odaberi **Transaction pooler**. Dobiješ niz oblika:

   ```
   postgresql://postgres.abcdefghijklmnop:[YOUR-PASSWORD]@aws-1-eu-central-1.pooler.supabase.com:6543/postgres
   ```

3. `[YOUR-PASSWORD]` (zajedno s uglatim zagradama) zamijeni lozinkom iz koraka 1.1. To je `DATABASE_URL`.

**Zašto baš Transaction pooler, a ne Direct connection:** izravni spoj (`db.<ref>.supabase.co:5432`) na besplatnom planu radi samo preko IPv6, a Netlify i slični poslužitelji spajaju se preko IPv4; spoj bi pucao s „network is unreachable". Pooler je dostupan preko IPv4 na svim planovima. Uz to, aplikacija pri svakom zahtjevu otvara kratkotrajne spojeve, a upravo za to pooler služi (aplikacija zato koristi `prepare: false`, što transakcijski način traži).

**Ako lozinka sadrži posebne znakove** (`@ : / ? # [ ] %` i slično), u nizu ih treba zamijeniti kodom: `@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`, `%` → `%25`. Jednostavnije je generiranu lozinku ostaviti kakva jest ili postaviti novu bez tih znakova.

### 1.3 Isprobaj spoj sa svog računala

U mapi projekta napravi datoteku `.env.local` s jednim retkom (niz obavezno u navodnicima):

```bash
DATABASE_URL="postgresql://postgres.abcdefghijklmnop:lozinka@aws-1-eu-central-1.pooler.supabase.com:6543/postgres"
```

pa pokreni:

```bash
pnpm db:migrate
```

Ispis **„Migracije su primijenjene."** znači da spoj radi i da su tablice napravljene. Provjeri ih u Supabaseu pod **Table Editor**: trebaju postojati `communities`, `items`, `messages`, `community_requests` i `sender_rules`.

Ako želiš lokalno raditi s ugrađenom bazom umjesto sa Supabaseom, samo obriši ili zakomentiraj redak `DATABASE_URL`.

### 1.4 Česte greške

| Poruka | Uzrok i rješenje |
|---|---|
| `password authentication failed` | Kriva lozinka ili neizmijenjen `[YOUR-PASSWORD]`. Ako je lozinka s posebnim znakovima, kodiraj ih (1.2) ili postavi novu. |
| `network is unreachable` / `ENETUNREACH` | Koristiš izravni spoj na IPv6. Uzmi **Transaction pooler** (port 6543). |
| `Tenant or user not found` | Korisničko ime mora biti `postgres.<oznaka-projekta>`, a ne samo `postgres`. Kopiraj niz ponovno iz **Connect**. |
| `prepared statement ... already exists` | Nedostaje `prepare: false`. Aplikacija ga postavlja sama; javlja se ako spajaš nekim drugim alatom. |
| Spoj radi, a onda prestane | Besplatni projekt pauzira se nakon 7 dana bez ijednog upita na bazu. U Supabaseu klikni **Resume project**; podaci ostaju. Za pilot bez prometa postavi npr. GitHub Action koji jednom dnevno otvori `/api/health`. |

### 1.5 Što dalje

Isti `DATABASE_URL` upisuješ i na Netlify (korak 4). Tablice se ondje rade same, jer je `pnpm db:migrate` dio build naredbe u `netlify.toml`.

**Besplatni plan:** 500 MB baze i bez automatskih sigurnosnih kopija. Za Rokovnik je 500 MB i više nego dovoljno (tekst objava), ali kopije napravi sam prije širenja: *Database → Backups* nudi preuzimanje, ili lokalno `pg_dump "$DATABASE_URL" > kopija.sql`.

## 2. AI za čitanje mailova: Anthropic ili Gemini

Na console.anthropic.com napravi API ključ: `ANTHROPIC_API_KEY`. Jedna okružnica stoji djelić centa. Bez ključa aplikacija radi, ali mailove čita jednostavnim pravilima, što za stvarne okružnice nije dovoljno pouzdano.

Zadani model je `claude-haiku-5-5` (`LLM_MODEL`). Ako želiš drugi, provjeri točan naziv u Anthropicovoj dokumentaciji.

**Alternativa: Gemini.** Ključ napraviš u Google AI Studiju (aistudio.google.com → Get API key) i upišeš kao `GEMINI_API_KEY`. Besplatni sloj ne traži karticu, ali ima ograničenje brzine i Google u njemu smije koristiti poslani sadržaj za poboljšanje svojih proizvoda, pa ga nemoj koristiti za tuđe okružnice (npr. FSB) bez dopuštenja. Plaćeni sloj to ne radi. Zadani model je `gemini-3.6-flash` (`GEMINI_MODEL`); ako Google javi da model ne postoji, u AI Studiju pogledaj trenutni naziv.

Ako su postavljena oba ključa, `LLM_PROVIDER=gemini` ili `LLM_PROVIDER=anthropic` odlučuje koji se koristi. Na stranici /admin piše koji je aktivan.

## 3. Mail: Resend

Registriraj se **e-mail adresom na koju želiš primati zahtjeve za nove zajednice** (to će biti `ADMIN_EMAIL`): bez vlastite domene Resend šalje samo na adresu vlasnika računa.

1. **API Keys → Create**: `RESEND_API_KEY`.
2. **Emails → Receiving**: zapiši svoju domenu oblika `<nešto>.resend.app`. Svaka adresa na toj domeni stiže u sustav; odaberi jednu, npr. `objavi@<nešto>.resend.app`. To je `INBOUND_ADDRESS`.
3. Webhook dodaješ u koraku 5, kad znaš adresu aplikacije.

## 4. Hosting: Netlify

1. **Add new site → Import from GitHub** i odaberi repozitorij. Build naredba i mapa čitaju se iz `netlify.toml`.
2. **Site configuration → Environment variables**, prema `.env.example`:

| Varijabla | Vrijednost |
|---|---|
| `DATABASE_URL` | iz koraka 1 |
| `APP_SECRET` | nasumičnih 32+ znakova (`openssl rand -hex 32`) |
| `ADMIN_PASSWORD` | lozinka za `/admin` |
| `ANTHROPIC_API_KEY` | iz koraka 2 |
| `RESEND_API_KEY` | iz koraka 3 |
| `INBOUND_ADDRESS` | iz koraka 3 |
| `ADMIN_EMAIL` | tvoja adresa (ista kao Resend račun) |
| `RESEND_WEBHOOK_SECRET` | dodaješ nakon koraka 5 |

3. Deploy. Provjera: `https://<tvoja-stranica>/api/health` treba vratiti `"ok": true` i `"izvlacenje": "ai"`.

Ako build na Netlifyju zapne na Next.js verziji, ista aplikacija bez izmjena radi i na Vercelu (iste varijable; build naredba `pnpm db:migrate && pnpm build`).

## 5. Poveži primanje maila

U Resendu: **Webhooks → Add Webhook**

- URL: `https://<tvoja-stranica>/api/inbound/resend`
- događaj: `email.received`

Kopiraj **Signing secret** (počinje s `whsec_`) u varijablu `RESEND_WEBHOOK_SECRET` na Netlifyju i ponovno pokreni deploy.

## 6. Prvi test

1. `/admin` → **Testni mail**: provjera obrade bez pravog maila.
2. Sa svoje adrese (`ADMIN_EMAIL`) **proslijedi** jednu okružnicu na `INBOUND_ADDRESS`. Očekivano:
   - sustav prepozna izvornog pošiljatelja (npr. domenu `fsb.unizg.hr`);
   - stigne ti mail „nova zajednica?” s poveznicom; otvori je i klikni **Potvrdi zajednicu**;
   - okružnica se obradi i objavi, a sljedeće s iste domene objavljuju se odmah.
3. Otvori zajednicu, klikni na događaj i isprobaj **Dodaj u moj kalendar** te **Prati u svom kalendaru** na mobitelu i na računalu.

## Automatsko prosljeđivanje okružnica

U Gmailu: *Postavke → Prosljeđivanje* (ili filtar za pošiljatelja okružnica) na `INBOUND_ADDRESS`. Gmail prvo šalje potvrdni kôd na tu adresu; naći ćeš ga u Resendu pod **Emails → Receiving**. Kod automatskog prosljeđivanja pošiljatelj ostaje izvorni (npr. fakultet), pa svrstavanje radi i bez prepoznavanja proslijeđene poruke.

## Što treba znati prije javne objave

- **Trajanje obrade.** Mail se obrađuje unutar webhook zahtjeva (AI poziv traje nekoliko sekundi, s PDF privitkom dulje). Ako hosting prekine zahtjev, Resend ponavlja isporuku, a aplikacija tada dovršava prekinutu obradu; poruku možeš i ručno pokrenuti u `/admin` → *Obradi ponovno*. Provjeri ograničenje trajanja funkcija na svom planu.
- **Provjera pošiljatelja.** Mail se odbija ako ne prođe DMARC, odnosno ni SPF ni DKIM. Domene bez tih zapisa nije moguće pouzdano razlikovati od lažiranih, pa prije širenja na više organizacija vrijedi pooštriti pravilo (npr. zahtijevati DMARC).
- **Dopuštenje za objavu.** Okružnice mogu biti interne. Prije javnog dijeljenja FSB zajednice dogovori s fakultetom što se smije objaviti.
- **Vlastita domena.** Za adresu poput `objavi@tvoja-domena.hr` i slanje obavijesti drugim adresama dodaj domenu u Resendu (MX i DKIM zapisi) te postavi `RESEND_FROM`. Za primanje koristi poddomenu, jer MX zapis preusmjerava svu poštu te domene.
- **Lozinka administratora** je jedina zaštita `/admin`: neka bude duga i jedinstvena.
