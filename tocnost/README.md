# Test točnosti čitanja mailova

27 realističnih mailova (`mailovi/`) i očekivani rezultati (`ocekivano.json`): predavanja, višednevni događaji, hackathon, serija radionica, webinar, stipendije, EU i poljoprivredni natječaji, cjeloživotno obrazovanje, jezični tečaj, ispravak termina, otkazani događaj, mail bez događaja, proslijeđeni mail, mail na engleskom, rimski brojevi, relativni datumi („sutra”, „u petak”) i pokušaj podmetanja uputa AI-ju.

Ukupno 36 obaveznih stavki (događaja i rokova).

## Što se mjeri

- **Odziv**: koliko očekivanih stavki je pronađeno (ista vrsta i isti dan).
- **Preciznost**: koliko pronađenog nije višak (izmišljene, prošle ili otkazane stavke).
- Na pronađenim stavkama: **vrijeme**, **kraj**, **mjesto**, **naslov**, **online poveznica**.
- **Mail potpuno točan**: sve stavke pronađene, bez viška, sva polja točna.

## 1. Brzi test (bez slanja mailova)

Mailove čita AI iz tvog `.env.local` (Claude ili Gemini), izravno, kao da su primljeni 18. 11. 2026. u 9:00:

```bash
npx pnpm@10 tocnost             # AI
npx pnpm@10 tocnost --pravila   # bez AI-ja, za usporedbu
npx pnpm@10 tocnost --samo 04,15
```

Trošak s Claude Haikuom je reda veličine nekoliko centi za cijeli skup.

## 2. Test na objavljenoj stranici (cijeli put kroz sustav)

**Automatski** (potpisano s `INBOUND_SECRET`, isti put kao pravi mail nakon Resenda):

```bash
npx pnpm@10 tocnost posalji https://rokovnikhr.netlify.app --od "Test tocnosti <tocnost@tvoja-domena.hr>"
```

Ako je adresa nova, u `/admin` potvrdi zajednicu (npr. „tocnost”) i pričekaj minutu. Zatim:

```bash
npx pnpm@10 tocnost provjeri https://rokovnikhr.netlify.app --zajednica tocnost
```

**Ručno** (pravi mail kroz Resend): svaki mail iz `mailovi/` pošalji na adresu za objave. Prvi redak („Od”) je samo opis; šalješ sa svoje adrese, s naslovom iz retka „Naslov” i tekstom ispod njega. Zatim:

```bash
npx pnpm@10 tocnost provjeri https://rokovnikhr.netlify.app --zajednica <tvoja-zajednica>,fsb --nakon 2026-11-20T10:00
```

- `--nakon`: vrijeme kad si počeo slati (starije objave u istoj zajednici se ne broje).
- `fsb` je u popisu jer mail 22 je proslijeđen: kad ga pošalje povjerljivi prosljeđivač, objavljuje se u zajednici izvornog pošiljatelja (`fsb.unizg.hr`).
- Mailovi 14, 20 i 21 imaju relativne datume (bez godine, „sutra”, „u petak”), pa se na stranici ne provjeravaju.

Izvještaji se spremaju u `rezultati/` (ne idu na git).

## Kako dodati mail

Dodaj datoteku u `mailovi/` (redak `Od:`, redak `Naslov:`, prazan redak, tekst) i zapis u `ocekivano.json`. Za mjesto i naslov navedi korijene riječi, jer se hrvatske riječi sklanjaju („dvorana a”, „dvorani a”). Stavka s `"neobavezno": true` ne broji se ni kao propust ni kao višak.
