import type { Metadata } from "next";
import Link from "next/link";
import { deleteAccountAction, logoutEverywhereAction, logoutUserAction, rotateFeedAction } from "@/app/account-actions";
import { Subscribe } from "@/components/Subscribe";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth";
import { baseUrl } from "@/lib/base-url";
import { accountKind, managedCommunities } from "@/lib/users";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moj račun", robots: { index: false } };

const KIND = { admin: "Administrator", organizacija: "Organizacija", korisnik: "Korisnik" } as const;
const FLASH: Record<string, string> = {
  "nova-adresa": "Adresa osobnog kalendara je zamijenjena. Stara više ne radi; dodaj kalendar ponovno.",
  potvrda: "Za brisanje računa upiši riječ OBRIŠI.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ poruka?: string }> }) {
  const user = await requireUser("/racun");
  const [sp, origin, kind, managed] = await Promise.all([searchParams, baseUrl(), accountKind(user), managedCommunities(user.email)]);
  return (
    <div>
      <div className="pagehead">
        <h1>Moj račun</h1>
      </div>
      {sp.poruka && FLASH[sp.poruka] ? <div className="flash flash--ok">{FLASH[sp.poruka]}</div> : null}
      <div className="account__grid">
        <div className="paper paper--pad">
          <p style={{ marginTop: 0 }}>
            <b>{user.name || user.email}</b> <span className="badge">{KIND[kind]}</span>
          </p>
          <p className="muted">{user.email}</p>
          <div className="linkrow" style={{ flexWrap: "wrap" }}>
            <Link className="btn btn--quiet" href="/moj">
              Moj kalendar
            </Link>
            {kind === "admin" ? (
              <Link className="btn btn--quiet" href="/admin">
                Administracija
              </Link>
            ) : null}
            {managed.length || kind === "admin" ? (
              <Link className="btn btn--quiet" href="/organizacija">
                Moje zajednice
              </Link>
            ) : null}
          </div>
          <form action={logoutUserAction} style={{ marginTop: 14 }}>
            <SubmitButton className="btn" pending="Odjavljujem…">
              Odjavi se
            </SubmitButton>
          </form>
        </div>

        <div className="paper paper--pad">
          <h2 className="aside__title">Moj kalendar u kalendarskoj aplikaciji</h2>
          <p className="note">Jedna pretplata za sve što pratiš i spremiš. Promjene stižu same.</p>
          <Subscribe baseUrl={origin} feedPath={`/ics/moj.ics?k=${user.feedToken}`} name="Rokovnik: moj kalendar" label="Dodaj u svoj kalendar" block />
          <form action={rotateFeedAction} style={{ marginTop: 12 }}>
            <p className="small muted">Adresa je tajna: tko je ima, vidi tvoj izbor. Ako si je podijelio greškom, zamijeni je.</p>
            <SubmitButton className="btn btn--quiet btn--small" pending="Mijenjam…">
              Zamijeni adresu
            </SubmitButton>
          </form>
        </div>

        <div className="paper paper--pad">
          <h2 className="aside__title">Sigurnost i podaci</h2>
          <form action={logoutEverywhereAction}>
            <p className="small muted">Izgubljen uređaj ili tuđe računalo? Odjavi se sa svih uređaja odjednom.</p>
            <SubmitButton className="btn btn--quiet btn--small" pending="Odjavljujem…">
              Odjavi se sa svih uređaja
            </SubmitButton>
          </form>
          <form action={deleteAccountAction} style={{ marginTop: 18 }}>
            <p className="small muted">Brisanje računa trajno uklanja tvoje podatke: ime, adresu, praćenja i spremljene događaje.</p>
            <div className="field">
              <label htmlFor="potvrda">Za potvrdu upiši OBRIŠI</label>
              <input id="potvrda" name="potvrda" autoComplete="off" />
            </div>
            <SubmitButton className="btn btn--danger btn--small" pending="Brišem…">
              Obriši račun
            </SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
