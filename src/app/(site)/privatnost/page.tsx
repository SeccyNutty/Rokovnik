import type { Metadata } from "next";
import { APP_NAME } from "@/lib/config";

export const metadata: Metadata = { title: "Privatnost" };

export default function PrivacyPage() {
  return (
    <div className="prose">
      <h1>Privatnost</h1>
      <h2>Posjetitelji bez računa</h2>
      <p>
        Za pregled kalendara i dodavanje događaja u vlastitu kalendarsku aplikaciju ne treba račun, a {APP_NAME} o posjetiteljima ne prikuplja
        osobne podatke. Odabrana kalendarska aplikacija pamti se samo na tvom uređaju.
      </p>
      <h2>Korisnički račun</h2>
      <p>
        Račun se otvara prijavom putem Googlea. Od Googlea primamo samo ime, e-mail adresu i oznaku računa; lozinku ne vidimo. Uz račun spremamo
        zajednice koje pratiš i događaje koje si dodao u Moj kalendar. Prijava se pamti kolačićem na tvom uređaju 30 dana.
      </p>
      <p>
        Adresa tvog osobnog kalendara (za kalendarsku aplikaciju) je tajna; možeš je zamijeniti novom u postavkama računa. Račun i sve njegove
        podatke možeš sam trajno obrisati na stranici „Moj račun”.
      </p>
      <h2>Zahtjev da se organizacija pridruži</h2>
      <p>
        Kad zatražiš organizaciju koje još nema, spremamo njezin naziv, mrežnu stranicu i napomenu koje upišeš. Ako ostaviš e-mail adresu, koristimo je
        samo da ti javimo kad se organizacija pridruži.
      </p>
      <h2>Organizacije koje objavljuju</h2>
      <p>
        Od mailova poslanih na adresu za objave spremamo adresu i ime pošiljatelja, naslov i tekst poruke te rezultat provjere pošiljatelja
        (SPF, DKIM, DMARC). Iz teksta se automatski izvlače podaci o događaju i rokovima, koji se javno objavljuju. Izvorni tekst maila vide samo
        administrator i upravitelji te zajednice. Privitke ne spremamo: čitaju se jednokratno pri obradi. Pošiljatelju se mailom javlja je li
        objava uspjela.
      </p>
      <p>Za izvlačenje podataka tekst maila obrađuje vanjska usluga umjetne inteligencije (Anthropic), a za primanje i slanje maila usluga Resend.</p>
      <h2>Ispravak i brisanje</h2>
      <p>Za ispravak ili uklanjanje objave, ili brisanje spremljenih mailova svoje organizacije, javi se administratoru sustava.</p>
    </div>
  );
}
