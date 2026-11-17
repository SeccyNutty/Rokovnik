import type { Community, CommunityRequest } from "@/db/schema";
import { decideRequestAction } from "@/app/(site)/admin/actions";
import { SubmitButton } from "./SubmitButton";

/** Zahtjev za novu zajednicu: ime je predloženo, dovoljno je kliknuti "Potvrdi". */
export function RequestForm(props: {
  request: CommunityRequest;
  communities: Community[];
  token?: string;
  related?: { id: string; name: string; domain: string }[];
}) {
  const r = props.request;
  const id = r.id;
  return (
    <div className="paper reqcard">
      <div className="reqcard__from">{r.kind === "domain" ? `Domena ${r.value}` : `Adresa ${r.value}`}</div>
      <div className="small muted">
        Prvi mail: {r.sampleFrom}
        {r.sampleSubject ? ` · „${r.sampleSubject}”` : ""}
      </div>
      {!r.verified ? (
        <p className="detail__unsure" style={{ marginTop: 10 }}>
          <b>Pošiljatelj nije dokazan.</b> Mail nije prošao DMARC provjeru, pa adresa može biti lažirana. Potvrdi samo ako očekuješ mail od te organizacije.
          Budući mailovi bez dokaza neće se objavljivati sami, nego će čekati ručnu odluku.
        </p>
      ) : null}
      {props.related?.length ? (
        <p className="detail__unsure" style={{ marginTop: 10 }}>
          Slična domena već ima zajednicu: {props.related.map((r) => `${r.domain} → ${r.name}`).join(", ")}. Ako je ovo ista organizacija, odaberi
          je ispod umjesto nove zajednice.
        </p>
      ) : null}
      <form action={decideRequestAction} className="reqcard__form">
        {props.token ? <input type="hidden" name="token" value={props.token} /> : <input type="hidden" name="requestId" value={id} />}
        <div className="field">
          <label htmlFor={`name-${id}`}>Ime zajednice</label>
          <input id={`name-${id}`} name="name" defaultValue={r.suggestedName} maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor={`slug-${id}`}>Adresa stranice</label>
          <input id={`slug-${id}`} name="slug" defaultValue={r.suggestedSlug} maxLength={40} pattern="[a-z0-9-]+" />
        </div>
        {props.communities.length ? (
          <div className="field span2">
            <label htmlFor={`existing-${id}`}>Ili dodaj pošiljatelja u postojeću zajednicu</label>
            <select id={`existing-${id}`} name="existing" defaultValue="">
              <option value="">Nova zajednica (gore)</option>
              {props.communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="reqcard__btns span2">
          <SubmitButton name="odluka" value="potvrdi" pending="Potvrđujem…">
            Potvrdi zajednicu
          </SubmitButton>
          <SubmitButton className="btn btn--danger" name="odluka" value="odbij" pending="Odbijam…">
            Odbij pošiljatelja
          </SubmitButton>
        </div>
      </form>
      <p className="small muted" style={{ margin: "10px 0 0" }}>
        Potvrdom se mailovi na čekanju obrađuju i objavljuju (za nekoliko sekundi), a budući mailovi s {r.kind === "domain" ? "ove domene" : "ove adrese"} idu bez potvrde.
      </p>
    </div>
  );
}
