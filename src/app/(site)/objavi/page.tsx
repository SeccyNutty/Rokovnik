import type { Metadata } from "next";
import { CopyButton } from "@/components/CopyButton";
import { APP_NAME, inboundAddress } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Objavi događaj ili rok" };

export default function PublishPage() {
  const address = inboundAddress();
  return (
    <div style={{ maxWidth: 680 }}>
      <div className="pagehead">
        <h1>Objava je običan mail</h1>
        <p className="lead">
          Bez novog računa i bez obrasca. Obavijest koju ionako šalješ svojim članovima pošalji i ovamo, a {APP_NAME} iz nje sam pročita događaj i rokove.
        </p>
      </div>
      <div className="paper">
        <ol className="steps">
          <li>
            <div>
              <h3>Pošalji ili proslijedi mail</h3>
              <p>Sa službene adrese svoje organizacije, na adresu:</p>
              {address ? (
                <p style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <span className="address" style={{ marginTop: 0 }}>{address}</span>
                  <CopyButton text={address} className="btn btn--quiet btn--small" />
                </p>
              ) : (
                <p className="address">Adresa za objave još nije postavljena.</p>
              )}
              <p style={{ marginTop: 8 }}>Najlakše: dodaj ovu adresu na popis primatelja svojih okružnica.</p>
            </div>
          </li>
          <li>
            <div>
              <h3>Sustav prepozna tvoju organizaciju</h3>
              <p>
                Prema domeni adrese s koje šalješ (npr. @fsb.unizg.hr) mail ide u zajednicu tvoje organizacije. Kod prvog maila s nove domene
                zajednicu jednom potvrđuje administrator, a sve sljedeće objave idu bez čekanja.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h3>Događaj i rokovi su objavljeni</h3>
              <p>
                Pojavljuju se u kalendaru zajednice i u kalendarima svih koji je prate. Ako mail spominje i rok prijave, on se objavljuje kao zasebna
                stavka, da ga nitko ne propusti.
              </p>
            </div>
          </li>
        </ol>
      </div>

      <div className="prose" style={{ marginTop: 26 }}>
        <h2>Što napisati da objava bude točna</h2>
        <ul>
          <li>Datum s godinom i vrijeme početka („15. 12. 2026. u 14:15”).</li>
          <li>Mjesto ili poveznicu za praćenje.</li>
          <li>Rok prijave i poveznicu na prijavu, ako postoje.</li>
          <li>Jedan mail može sadržavati više događaja. Plakat u privitku (slika ili PDF) također se čita.</li>
        </ul>
        <h2>Ispravak i otkazivanje</h2>
        <p>
          Pošalji novi mail s istim naslovom događaja i ispravljenim podacima: postojeća objava se ažurira, i u kalendarima pretplatnika. Za
          uklanjanje objave javi se administratoru.
        </p>
      </div>
    </div>
  );
}
