# Postavljanje online

Četiri računa i oko pola sata. Supabase, Resend i Netlify imaju besplatnu razinu; AI (Anthropic) se plaća po korištenju, za pilot u centima. Redoslijed je bitan samo utoliko što zadnji korak (webhook) treba adresu aplikacije.

## 1. Baza: Supabase

1. Otvori novi projekt na supabase.com (regija: Frankfurt).
2. **Connect → Transaction pooler** (port 6543): kopiraj connection string i upiši lozinku baze. To je `DATABASE_URL`.

Tablice nastaju same pri prvom buildu (`pnpm db:migrate` je dio build naredbe). Aplikacija se na bazu spaja samo s poslužitelja; Supabase API i ključevi se ne koriste.

## 2. AI za čitanje mailova: Anthropic

Na console.anthropic.com napravi API ključ: `ANTHROPIC_API_KEY`. Jedna okružnica stoji djelić centa. Bez ključa aplikacija radi, ali mailove čita jednostavnim pravilima, što za stvarne okružnice nije dovoljno pouzdano.

Zadani model je `claude-haiku-5-5` (`LLM_MODEL`). Ako želiš drugi, provjeri točan naziv u Anthropicovoj dokumentaciji.

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
