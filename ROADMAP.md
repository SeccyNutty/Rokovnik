# Rokovnik: stanje i plan

Stanje: 18. 11. 2026. Objavljeno na https://rokovnikhr.netlify.app (Netlify + Supabase + Resend + Claude API).

## Sažetak

**Razina: PoC spreman za pokazivanje FSB-u.** Cijeli tok radi na objavljenoj stranici: mail stigne, svrsta se po domeni, nova organizacija čeka jedan klik potvrde, AI izvuče događaje i rokove, posjetitelj ih vidi na webu i dodaje u svoj kalendar.

**Nije spremno za javno lansiranje.** Glavne prepreke: točnost AI čitanja nije izmjerena (test postoji, treba ga pokrenuti), nema vlastite domene (bez nje povratne poruke stižu samo tebi), Google prijava još nije postavljena na produkciji, a FSB nije dao dopuštenje za javnu objavu okružnica.

Oznake u tablicama:

- **Produkcija**: radi na objavljenoj stranici i isprobano je tamo.
- **Lokalno**: izgrađeno i pokriveno testovima, ali na objavljenoj stranici još nije isprobano.
- **Ne**: nije izgrađeno.

## Što je napravljeno

### Objava mailom

| Funkcija | Stanje | Napomena |
|---|---|---|
| Primanje maila (Resend webhook, potpis) | Produkcija | adresa za objave na Resendovoj domeni (`INBOUND_ADDRESS`) |
| Svrstavanje u zajednicu po domeni pošiljatelja | Produkcija | javni servisi (gmail…) vežu se uz točnu adresu |
| Zahtjev za novu zajednicu i potvrda jednim klikom | Produkcija | iz administracije ili poveznicom iz maila |
| Potvrda je trenutna, obrada ide u pozadini | Lokalno | na Netlifyju provjeriti da mail prijeđe iz „u obradi” u „objavljeno” |
| AI čitanje (Claude), događaj + rok iz jednog maila | Produkcija | isprobano na testnom mailu, ne na pravim okružnicama |
| Gemini kao drugi pružatelj (`LLM_PROVIDER`) | Lokalno | pravi poziv nije isproban (nema ključa) |
| Čitanje bez AI-ja (pravila) | Lokalno | za razvoj i testove |
| Proslijeđeni mail → izvorni pošiljatelj | Lokalno | za povjerljive prosljeđivače (`ADMIN_EMAIL`, `FORWARDER_EMAILS`) |
| Ispravak istim naslovom i datumom, bez duplikata | Lokalno | |
| Provjera pošiljatelja: automatski samo uz DMARC dokaz | Lokalno | pala provjera → odbijeno; bez dokaza → čeka ručnu odluku |
| Po zajednici: blaža provjera (SPF + DKIM) i „samo dopuštene adrese” | Lokalno | blažu provjeru smije uključiti samo administrator |
| Upozorenje na zahtjevu za zajednicu kad pošiljatelj nije dokazan | Lokalno | |
| Povratna poruka objavitelju (ishod + poveznica na zajednicu) | Lokalno | bez vlastite domene stiže samo na adresu vlasnika Resend računa |
| Ograničenje: 60 mailova dnevno po pošiljatelju | Lokalno | |
| PDF i slike u privitku (plakati) | Lokalno | šalju se AI-ju; nije isprobano na pravom mailu |

### Posjetitelj

| Funkcija | Stanje | Napomena |
|---|---|---|
| Popis po danima i mjesec, filtar sve / događaji / rokovi | Produkcija | mobitel i računalo |
| Opis događaja, „Dodaj u moj kalendar” (Google, Outlook, Microsoft 365, Apple/.ics) | Produkcija | |
| „Dodaj u Moj kalendar” i „Zaprati zajednicu” (traže račun; gost dobiva poziv na prijavu) | Lokalno | nakon prijave radnja je već izvršena |
| Moj kalendar vezan uz račun, na svim uređajima | Lokalno | zamijenio je izbor spremljen na uređaju |
| Osobna pretplata (ICS) s tajnom adresom koja se može zamijeniti | Lokalno | |
| Pretplata na kalendar (ICS) | Lokalno | zajednica, sve zajednice, Moj kalendar; nije isprobano u pravoj kalendarskoj aplikaciji |
| Stranica događaja za dijeljenje | Produkcija | |

### Organizacije

| Funkcija | Stanje | Napomena |
|---|---|---|
| Konektor: `widget.js` (jedan redak koda, automatska visina) | Lokalno | postavke: prikaz, vrsta, broj, tema, boja |
| Slaganje koda s pregledom (`/z/<zajednica>/ugradi`) | Lokalno | |
| Javni JSON API (`/api/v1/…`) | Lokalno | samo čitanje, CORS otvoren |
| Obični iframe (`/ugradi/<zajednica>`) | Lokalno | |

### Teme i pretraga

| Funkcija | Stanje | Napomena |
|---|---|---|
| Oznake na objavama (19 tema), AI ih dodjeljuje, ispravak u administraciji | Lokalno | postojeće objave dobile su oznaku iz stare kategorije |
| Filtar „Tema” u kalendaru, oznake u opisu događaja | Lokalno | |
| Tematske zajednice (npr. „Stipendije” iz svih organizacija) | Lokalno | stvara ih administrator; nijedna još nije stvorena |
| Pretraga zajednica i zahtjev „Zatraži da se pridruži” | Lokalno | mail administratoru za 1., 3., 10., 25. … zahtjev |

### Računi

| Funkcija | Stanje | Napomena |
|---|---|---|
| Prijava putem Googlea (OIDC, PKCE, provjera potpisa) | Lokalno | treba postaviti Google klijent (DEPLOY.md, korak 7) |
| Tri vrste računa: korisnik, organizacija, administrator | Lokalno | uloge se provjeravaju u bazi pri svakoj radnji |
| Stranica organizacije (`/organizacija`) | Lokalno | opis, pošiljatelji, zadržani mailovi, sakrivanje objava |
| Moj račun: odjava sa svih uređaja, brisanje računa | Lokalno | |

### Administracija i rad sustava

| Funkcija | Stanje | Napomena |
|---|---|---|
| Administracija: zahtjevi, mailovi, objave, zajednice, testni mail | Produkcija | Google račun administratora ili rezervna lozinka |
| Upravitelji zajednica, zadržani mailovi, dnevnik radnji | Lokalno | |
| Sigurnosna zaglavlja (CSP, HSTS), ograničenja učestalosti u bazi, istek poveznica | Lokalno | |
| Sakrij / prikaži objavu, ponovna obrada maila | Produkcija | |
| Baza na Supabaseu, migracije pri deployu, RLS na svim tablicama | Produkcija | |
| Predmemorija javnih upita s poništavanjem pri objavi | Lokalno | drugo otvaranje stranice: 0 upita prema bazi |
| Traka napretka pri navigaciji, gumbi s trenutnom reakcijom | Lokalno | |
| Keepalive (GitHub Actions) | Lokalno | treba varijablu `SITE_URL` u GitHubu |
| Testovi: 75 testova logike, 63 testa u pregledniku, smoke provjera | Lokalno | `pnpm test`, `pnpm test:e2e`, `pnpm smoke <adresa>` |
| Test točnosti čitanja: 27 mailova, 36 stavki | Lokalno | `pnpm tocnost`; osnovna razina bez AI-ja 53 % stavki, AI još nije izmjeren |
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

### Sada (tvoji koraci)

1. **Google prijava** (DEPLOY.md, korak 7) i `APP_URL` na Netlifyju.
2. **Test točnosti**: `pnpm tocnost` (izravno), zatim `pnpm tocnost posalji` i `provjeri` na objavljenoj stranici. Ako je točnost slaba na nekoj vrsti mailova, popravljamo upute AI-ju i ponavljamo.
3. **Regija funkcija i keepalive** (DEPLOY.md, „Brzina”).
4. **Stvori prve tematske zajednice** u `/admin` → *Tematske zajednice* (npr. Stipendije, Natječaji i EU fondovi, Cjeloživotno obrazovanje).
5. **Provjeri DMARC domene `fsb.unizg.hr`.** Ako ga nema, okružnice poslane izravno s FSB-a čekat će ručnu odluku; tada za tu zajednicu uključi blažu provjeru ili ih prosljeđuj sa svoje adrese.

### Prije razgovora s FSB-om

6. **Proći cijeli tok na produkciji**: prijava, Moj kalendar, praćenje, račun organizacije, widget na probnoj stranici, pretplata u Google i Apple kalendaru.
7. **Dopuštenje FSB-a** za javnu objavu okružnica (dio je interan).

### Prije javnog lansiranja

8. **Vlastita domena** (`rokovnik.hr` ili slična): web adresa, adresa za objave i slanje povratnih poruka organizacijama.
9. **Uređivanje objave** u administraciji i na stranici organizacije (danas: sakrij ili pošalji ispravak mailom).
10. **Sigurnosne kopije baze** (besplatni Supabase ih nema) i praćenje grešaka.
11. **Privatnost i uvjeti**: pravni pregled teksta, obrada osobnih podataka iz mailova, brisanje na zahtjev.

### Kasnije

12. Podsjetnici pred rok i tjedni sažetak mailom (sada je moguće jer postoje računi).
13. Sučelje na engleskom.
14. Objava događaja kroz obrazac na stranici organizacije (uz mail).
15. Predmemorija stranica na CDN-u kad promet naraste.
16. Model prihoda (sponzori; besplatno za organizacije koje ne zarađuju).
17. Obavijest mailom onima koji su tražili organizaciju, kad se ona pridruži (adrese se već spremaju).
18. **Statistika za organizacije**: pregledi, jedinstveni posjetitelji, povratnici, klikovi na prijavu. Razrada je u odjeljku [Plan: statistika za organizacije](#plan-statistika-za-organizacije). Samo bilježenje vrijedi uključiti ranije od prikaza, jer se pregledi ne mogu naknadno izbrojiti.

## Plan: statistika za organizacije

Cilj: organizacija vidi koliko joj objava na Rokovniku donosi. To joj je mjerilo učinkovitosti, a nama glavni argument zašto da objavljuje kod nas.

### Što se mjeri po objavi

| Mjera | Kako | Napomena |
|---|---|---|
| Pregledi | svako otvaranje opisa objave (naša stranica, widget) | |
| Jedinstveni posjetitelji | prijavljeni po računu; gosti po anonimnom dnevnom ključu, bez kolačića | gost se broji jednom dnevno, ne kroz više dana |
| Povratnici | koliko je ljudi objavu otvorilo 1, 2–3 ili 4 i više puta | samo prijavljeni korisnici; organizacija vidi samo raspodjelu |
| Klik na prijavu | poveznica za prijavu ide preko naše adrese za preusmjeravanje | najbliže stvarnoj prijavi što možemo izmjeriti |
| Namjera | „Dodaj u Rokovnik”, dodavanje u Google/Outlook/.ics, novi pratitelji zajednice | |
| Izvor | naša stranica, widget (s koje domene), tematska zajednica | |

Izvedene brojke:

- **Konverzija**: klikovi na prijavu ÷ jedinstveni posjetitelji.
- **Predomišljanje**: koliko je ljudi kliknulo prijavu tek nakon dva ili više posjeta.

### Koliko se ljudi stvarno prijavilo

Prijava se odvija na obrascu organizatora, pa je Rokovnik ne vidi. Mogućnosti, od najjednostavnije:

1. Brojimo klikove na poveznicu za prijavu.
2. Poveznici dodajemo `utm_source=rokovnik`, pa organizacija u svojoj analitici vidi koliko je prijava došlo od nas.
3. Kasnije: vlastiti gumb „Dolazim” ili prijava kroz Rokovnik. Tada broj prijava postaje točan.

### Privatnost (GDPR)

- Organizacija vidi samo zbirne brojeve, nikad tko je gledao.
- Brojevi manji od 5 prikazuju se kao „< 5”, da se pojedinac ne može prepoznati.
- Gosti se broje bez kolačića: ključ je sažetak (hash) IP adrese i preglednika s tajnom koja se mijenja i briše svaki dan. Zato ne treba obavijest o kolačićima. Cijena je da gosta ne možemo pratiti kroz više dana.
- Praćenje povrataka za prijavljene korisnike opisano je u pravilima privatnosti i može se isključiti u „Moj račun”. Pravnu osnovu provjeriti u sklopu točke 11.
- Pojedinačni zapisi čuvaju se 90 dana, nakon toga ostaju samo dnevni zbrojevi.
- Botovi i unaprijedno učitavanje stranica (prefetch) se ne broje.

### Tehnički

- Preglednik šalje zapis nakon učitavanja stranice (`sendBeacon`). Stranice tako ostaju u predmemoriji i brzina se ne mijenja.
- Tablica pojedinačnih događaja i tablica dnevnih zbrojeva, obje s RLS-om.
- Poveznica za prijavu ide kroz `/r/<objava>`: zabilježi klik, pa preusmjeri na obrazac organizatora (`registrationUrl`).
- Prikaz u `/organizacija`: po objavi brojke i graf kroz vrijeme. Administrator vidi sve organizacije.
- Mail organizaciji nakon roka ili događaja, npr. „312 pregleda, 190 ljudi, 41 klik na prijavu”. Ovisi o vlastitoj domeni (točka 8).

## Poznata ograničenja

- Widget prikazuje jednu zajednicu (više zajednica u jednom widgetu nije potrebno).
- Lažni Google za testove radi samo lokalno; prava prijava ne može se automatski testirati bez Google računa.
- Besplatni Supabase pauzira bazu nakon 7 dana bez prometa (keepalive to sprječava).
- Obrada jednog maila traje nekoliko sekundi (AI); s velikim PDF-om dulje.
