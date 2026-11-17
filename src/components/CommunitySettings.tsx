import Link from "next/link";
import { addManagerAction, addSenderAction, decideHeldAction, removeManagerAction, removeSenderAction, saveCommunityAction } from "@/app/community-actions";
import type { Community, SenderRule } from "@/db/schema";
import { SubmitButton } from "./SubmitButton";

export type HeldMessage = { id: string; subject: string; senderAddress: string; error: string | null; receivedAt: Date };
export type Manager = { id: string; email: string };

/** Postavke jedne zajednice: opis, tko smije objavljivati, zadržani mailovi i upravitelji. */
export function CommunitySettings(props: {
  community: Community;
  rules: SenderRule[];
  held: HeldMessage[];
  managers: Manager[];
  /** Administrator vidi i mijenja sve; organizacija ne mijenja ime, strogu provjeru ni upravitelje. */
  admin: boolean;
  from: "admin" | "organizacija";
}) {
  const c = props.community;
  const id = c.id;
  const hidden = (
    <>
      <input type="hidden" name="communityId" value={id} />
      <input type="hidden" name="povratak" value={props.from} />
    </>
  );
  const domains = props.rules.filter((r) => r.kind === "domain");
  const addresses = props.rules.filter((r) => r.kind === "address");

  return (
    <div data-testid={`zajednica-${c.slug}`}>
      {props.held.length ? (
        <div className="warn" style={{ marginBottom: 14 }}>
          <b>Mailovi koji čekaju odluku ({props.held.length})</b>
          {props.held.map((m) => (
            <form key={m.id} action={decideHeldAction} style={{ marginTop: 10 }}>
              <input type="hidden" name="messageId" value={m.id} />
              <input type="hidden" name="povratak" value={props.from} />
              <div>
                „{m.subject || "bez naslova"}” · {m.senderAddress}
              </div>
              <div className="small muted">{m.error}</div>
              <div className="linkrow">
                <SubmitButton className="btn btn--small" name="odluka" value="objavi" pending="Objavljujem…">
                  Objavi
                </SubmitButton>
                <SubmitButton className="btn btn--quiet btn--small" name="odluka" value="odbaci" pending="Odbacujem…">
                  Odbaci
                </SubmitButton>
              </div>
            </form>
          ))}
        </div>
      ) : null}

      <form action={saveCommunityAction}>
        {hidden}
        <div className="field">
          <label htmlFor={`cn-${id}`}>Ime</label>
          <input id={`cn-${id}`} name="name" defaultValue={c.name} maxLength={80} required disabled={!props.admin} />
        </div>
        <div className="field">
          <label htmlFor={`cd-${id}`}>Kratak opis</label>
          <input id={`cd-${id}`} name="description" defaultValue={c.description} maxLength={400} />
        </div>
        <div className="field">
          <label htmlFor={`cs-${id}`}>Tko smije objavljivati</label>
          <select id={`cs-${id}`} name="senderMode" defaultValue={c.senderMode}>
            <option value="domain">Bilo tko s domene zajednice ({domains.map((d) => d.value).join(", ") || "nema domene"})</option>
            <option value="addresses">Samo dopuštene adrese (popis ispod)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`ca-${id}`}>Provjera pošiljatelja</label>
          <select id={`ca-${id}`} name="authMode" defaultValue={c.authMode} disabled={!props.admin}>
            <option value="strict">Stroga: objavljuje se samo mail s dokazanom domenom (DMARC)</option>
            <option value="relaxed">Blaža: prihvaća se i SPF + DKIM, za domene bez DMARC zapisa</option>
          </select>
          {c.authMode === "relaxed" ? <p className="small muted">Blaža provjera ne štiti potpuno od lažiranja adrese. Koristi je samo ako domena nema DMARC.</p> : null}
        </div>
        <div className="linkrow">
          <SubmitButton className="btn btn--small" pending="Spremam…">
            Spremi
          </SubmitButton>
          <Link className="btn btn--quiet btn--small" href={`/z/${c.slug}`}>
            Otvori
          </Link>
          <Link className="btn btn--quiet btn--small" href={`/z/${c.slug}/ugradi`}>
            Ugradnja
          </Link>
        </div>
      </form>

      <h3 style={{ marginTop: 18 }}>Dopuštene adrese</h3>
      {addresses.length === 0 ? <p className="small muted">Nema pojedinačnih adresa.</p> : null}
      {addresses.map((r) => (
        <form key={r.id} action={removeSenderAction} className="linkrow" style={{ alignItems: "center" }}>
          {hidden}
          <input type="hidden" name="ruleId" value={r.id} />
          <span style={{ flex: 1 }}>{r.value}</span>
          <SubmitButton className="btn btn--quiet btn--small" pending="…">
            Ukloni
          </SubmitButton>
        </form>
      ))}
      <form action={addSenderAction} className="linkrow" style={{ alignItems: "end" }}>
        {hidden}
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label htmlFor={`sa-${id}`}>Nova adresa</label>
          <input id={`sa-${id}`} name="address" type="email" placeholder="referada@fakultet.hr" required />
        </div>
        <SubmitButton className="btn btn--small" pending="…">
          Dodaj adresu
        </SubmitButton>
      </form>

      {props.admin ? (
        <>
          <h3 style={{ marginTop: 18 }}>Upravitelji (račun organizacije)</h3>
          <p className="small muted">Osoba s ovim Google računom može uređivati zajednicu, odlučivati o zadržanim mailovima i sakrivati objave.</p>
          {props.managers.map((m) => (
            <form key={m.id} action={removeManagerAction} className="linkrow" style={{ alignItems: "center" }}>
              {hidden}
              <input type="hidden" name="managerId" value={m.id} />
              <span style={{ flex: 1 }}>{m.email}</span>
              <SubmitButton className="btn btn--quiet btn--small" pending="…">
                Ukloni
              </SubmitButton>
            </form>
          ))}
          <form action={addManagerAction} className="linkrow" style={{ alignItems: "end" }}>
            {hidden}
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor={`ma-${id}`}>E-mail Google računa</label>
              <input id={`ma-${id}`} name="email" type="email" placeholder="ime.prezime@gmail.com" required />
            </div>
            <SubmitButton className="btn btn--small" pending="…">
              Dodaj upravitelja
            </SubmitButton>
          </form>
        </>
      ) : null}
    </div>
  );
}
