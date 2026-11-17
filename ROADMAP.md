# Rokovnik: stanje i plan

Stanje: 17. 11. 2026. Objavljeno na https://rokovnikhr.netlify.app (Netlify + Supabase + Resend + Claude API).

## Sažetak

**Razina: PoC spreman za pokazivanje FSB-u.** Cijeli tok radi na objavljenoj stranici: mail stigne, svrsta se po domeni, nova organizacija čeka jedan klik potvrde, AI izvuče događaje i rokove, posjetitelj ih vidi na webu i dodaje u svoj kalendar.

**Nije spremno za javno lansiranje.** Glavne prepreke: točnost AI čitanja nije izmjerena na pravim okružnicama, nema vlastite domene, FSB nije dao dopuštenje za javnu objavu okružnica, a zaštita od lažiranih pošiljatelja je osnovna.

Oznake u tablicama:

- **Produkcija**: radi na objavljenoj stranici i isprobano je tamo.
- **Lokalno**: izgrađeno i pokriveno testovima, ali na objavljenoj stranici još nije isprobano.
- **Ne**: nije izgrađeno.

## Što je napravljeno

### Objava mailom

| Funkcija | Stanje | Napomena |
|---|---|---|
| Primanje maila (Resend webhook, potpis) | Produkcija | adresa `objavi@crisoulkea.resend.app` |
| Svrstavanje u zajednicu po domeni pošiljatelja | Produkcija | javni servisi (gmail…) vežu se uz točnu adresu |
| Zahtjev za novu zajednicu i potvrda jednim klikom | Produkcija | iz administracije ili poveznicom iz maila |
| Potvrda je trenutna, obrada ide u pozadini | Lokalno | na Netlifyju provjeriti da mail prijeđe iz „u obradi” u „objavljeno” |
| AI čitanje (Claude), događaj + rok iz jednog maila | Produkcija | isprobano na testnom mailu, ne na pravim okružnicama |
| Gemini kao drugi pružatelj (`LLM_PROVIDER`) | Lokalno | pravi poziv nije isproban (nema ključa) |
| Čitanje bez AI-ja (pravila) | Lokalno | za razvoj i testove |
| Proslijeđeni mail → izvorni pošiljatelj | Lokalno | za povjerljive prosljeđivače (`ADMIN_EMAIL`, `FORWARDER_EMAILS`) |
| Ispravak istim naslovom i datumom, bez duplikata | Lokalno | |
| Provjera SPF/DKIM/DMARC | Lokalno | odbija se mail koji ne prođe DMARC, odnosno ni SPF ni DKIM |
| PDF i slike u privitku (plakati) | Lokalno | šalju se AI-ju; nije isprobano na pravom mailu |

### Posjetitelj

| Funkcija | Stanje | Napomena |
|---|---|---|
| Popis po danima i mjesec, filtar sve / događaji / rokovi | Produkcija | mobitel i računalo |
| Opis događaja, „Dodaj u moj kalendar” (Google, Outlook, Microsoft 365, Apple/.ics) | Produkcija | |
| „Dodaj u Moj kalendar” u samom Rokovniku, bez prijave | Lokalno | pamti se na uređaju, do 60 stavki |
| Moj kalendar iz više zajednica | Produkcija | |
| Pretplata na kalendar (ICS) | Lokalno | zajednica, sve zajednice, Moj kalendar; nije isprobano u pravoj kalendarskoj aplikaciji |
| Stranica događaja za dijeljenje | Produkcija | |

### Organizacije

| Funkcija | Stanje | Napomena |
|---|---|---|
| Konektor: `widget.js` (jedan redak koda, automatska visina) | Lokalno | postavke: prikaz, vrsta, broj, tema, boja |
| Slaganje koda s pregledom (`/z/<zajednica>/ugradi`) | Lokalno | |
| Javni JSON API (`/api/v1/…`) | Lokalno | samo čitanje, CORS otvoren |
| Obični iframe (`/ugradi/<zajednica>`) | Lokalno | |

### Administracija i rad sustava

| Funkcija | Stanje | Napomena |
|---|---|---|
| Administracija: zahtjevi, mailovi, objave, zajednice, testni mail | Produkcija | zaštita jednom lozinkom |
| Sakrij / prikaži objavu, ponovna obrada maila | Produkcija | |
| Baza na Supabaseu, migracije pri deployu, RLS na svim tablicama | Produkcija | |
| Predmemorija javnih upita s poništavanjem pri objavi | Lokalno | drugo otvaranje stranice: 0 upita prema bazi |
| Traka napretka pri navigaciji, gumbi s trenutnom reakcijom | Lokalno | |
| Keepalive (GitHub Actions) | Lokalno | treba varijablu `SITE_URL` u GitHubu |
| Testovi: 49 testova logike, 42 testa u pregledniku, smoke provjera | Lokalno | `pnpm test`, `pnpm test:e2e`, `pnpm smoke <adresa>` |
| CI na GitHubu (lint, tipovi, testovi, build, e2e) | Lokalno | |

## Brzina: nalaz i što je napravljeno

Mjerenje je pokazalo da sama aplikacija nije spora: poslužitelj stranicu složi za 10 do 40 ms, uz 2 do 3 upita. Sporost dolazi iz okoline:

1. **Udaljenost funkcija i baze.** Netlify funkcije su zadano u SAD-u (Ohio), baza je u Frankfurtu. Svaki upit prelazi ocean, a stranica ih je slala 2 do 3 zaredom.
2. **Hladni start.** Nakon mirovanja prva funkcija treba oko 2 s (vidi se u Netlify logu).
3. **Bez predmemorije.** Svako otvaranje išlo je do baze.
4. **Suvišni zahtjevi.** Mjesečni prikaz je unaprijed dohvaćao svih 35 do 42 dana.

Napravljeno: predmemorija upita s trenutnim poništavanjem (1., 3.), usporedni upiti, isključen suvišni prefetch (4.), keepalive (2.), indeks za kalendar zajednice, traka napretka i gumbi koji odmah reagiraju.

**Ostaje na tebi (najveći preostali dobitak):** premjestiti funkcije u Frankfurt i uključiti keepalive. Koraci su u [DEPLOY.md](DEPLOY.md), odjeljak „Brzina”. Stvarni učinak izmjeri s `pnpm smoke https://rokovnikhr.netlify.app` prije i poslije.

## Što još treba

### Prije razgovora s FSB-om

1. **Izmjeriti točnost čitanja** na 20 do 30 pravih okružnica (datum, vrijeme, mjesto, rok). Bez toga nema odgovora na pitanje „koliko griješi?”.
2. **Proći cijeli tok na produkciji** nakon ovih izmjena: pozadinska obrada, Moj kalendar, widget na probnoj stranici, pretplata u Google i Apple kalendaru.
3. **Regija funkcija i keepalive** (gore).
4. **Dopuštenje FSB-a** za javnu objavu okružnica (dio je interan).

### Prije javnog lansiranja

5. **Vlastita domena** (`rokovnik.hr` ili slična): web adresa i adresa za objave. Mijenjaju se dvije varijable.
6. **Stroža provjera pošiljatelja**: zahtijevati DMARC ili ručno odobrene adrese po zajednici. Danas je moguće lažirati domenu koja nema te zapise.
7. **Uređivanje objave u administraciji** (danas: sakrij ili pošalji ispravak mailom).
8. **Potvrda pošiljatelju** („Vaš događaj je objavljen”, s poveznicom i mogućnošću ispravka).
9. **Sigurnosne kopije baze** (besplatni Supabase ih nema) i praćenje grešaka.
10. **Privatnost i uvjeti**: provjeriti tekst, obradu osobnih podataka iz mailova, brisanje na zahtjev.

### Kasnije

11. Podsjetnici pred rok i tjedni sažetak mailom.
12. Korisnički računi (Moj kalendar na više uređaja).
13. Sučelje na engleskom.
14. Uloge za organizacije (vlastita administracija zajednice).
15. Widget za više zajednica odjednom, predmemorija stranica na CDN-u kad promet naraste.
16. Model prihoda (sponzori; besplatno za organizacije koje ne zarađuju).

## Poznata ograničenja

- Moj kalendar vrijedi po uređaju i pregledniku.
- Pretplata na Moj kalendar ne prati kasnije promjene izbora; treba je dodati ponovno.
- Besplatni Supabase pauzira bazu nakon 7 dana bez prometa (keepalive to sprječava).
- Obrada jednog maila traje nekoliko sekundi (AI); s velikim PDF-om dulje.
