import type { Metadata } from "next";
import { APP_NAME } from "@/lib/config";

export const metadata: Metadata = { title: "Privatnost" };

export default function PrivacyPage() {
  return (
    <div className="prose">
      <h1>Privatnost</h1>
      <h2>Posjetitelji</h2>
      <p>
        Za pregled kalendara ne treba račun i {APP_NAME} o posjetiteljima ne prikuplja osobne podatke. Izbor zajednica u „Mojem kalendaru” i
        odabrana kalendarska aplikacija spremaju se samo na tvom uređaju.
      </p>
      <h2>Organizacije koje objavljuju</h2>
      <p>
        Od mailova poslanih na adresu za objave spremamo adresu i ime pošiljatelja, naslov i tekst poruke. Iz teksta se automatski izvlače podaci
        o događaju i rokovima, koji se javno objavljuju. Izvorni tekst maila vidi samo administrator. Privitke ne spremamo: čitaju se jednokratno
        pri obradi.
      </p>
      <p>Za izvlačenje podataka tekst maila obrađuje vanjska usluga umjetne inteligencije (Anthropic), a za primanje i slanje maila usluga Resend.</p>
      <h2>Ispravak i brisanje</h2>
      <p>Za ispravak ili uklanjanje objave, ili brisanje spremljenih mailova svoje organizacije, javi se administratoru sustava.</p>
    </div>
  );
}
