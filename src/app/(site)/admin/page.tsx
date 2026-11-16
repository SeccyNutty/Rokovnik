import type { Metadata } from "next";
import Link from "next/link";
import { RequestForm } from "@/components/RequestForm";
import { requireAdmin } from "@/lib/auth";
import { adminEmail, forwarderEmails, inboundAddress } from "@/lib/config";
import { extractorMode, llmProvider, PROVIDER_LABEL } from "@/lib/extract";
import { listCommunities, listRecentItems, listRecentMessages, listRequests, listRules, relatedCommunities } from "@/lib/queries";
import { canSendEmail } from "@/lib/resend";
import { dateKey, formatDateShort, timeKey } from "@/lib/time";
import { logoutAction, reprocessAction, saveCommunityAction, testMailAction, toggleItemAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Administracija", robots: { index: false } };

const STATUS: Record<string, { label: string; cls: string }> = {
  pending_community: { label: "čeka potvrdu zajednice", cls: "tag tag--wait" },
  processing: { label: "u obradi", cls: "tag tag--wait" },
  published: { label: "objavljeno", cls: "tag tag--ok" },
  no_items: { label: "bez događaja i rokova", cls: "tag" },
  rejected: { label: "pošiljatelj odbijen", cls: "tag tag--bad" },
  unauthenticated: { label: "pošiljatelj nije potvrđen", cls: "tag tag--bad" },
  failed: { label: "greška pri obradi", cls: "tag tag--bad" },
};

const FLASH: Record<string, { text: string; ok: boolean }> = {
  potvrdeno: { text: "Zajednica je potvrđena, a mailovi na čekanju su obrađeni.", ok: true },
  odbijeno: { text: "Pošiljatelj je odbijen.", ok: true },
  "vec-rijeseno": { text: "Taj je zahtjev već riješen.", ok: true },
  obradeno: { text: "Poruka je ponovno obrađena.", ok: true },
  "obrada-greska": { text: "Obrada ponovno nije uspjela. Pogledaj grešku uz poruku.", ok: false },
  spremljeno: { text: "Zajednica je spremljena.", ok: true },
  "test-nepotpun": { text: "Za testni mail trebaju adresa pošiljatelja i tekst.", ok: false },
  "test-published": { text: "Testni mail je obrađen i objavljen.", ok: true },
  "test-pending_community": { text: "Testni mail je od novog pošiljatelja: potvrdi zajednicu u zahtjevima.", ok: true },
  "test-no_items": { text: "U testnom mailu nije pronađen nijedan datum događaja ni rok.", ok: false },
  "test-failed": { text: "Obrada testnog maila nije uspjela. Pogledaj grešku uz poruku.", ok: false },
  "test-rejected": { text: "Taj je pošiljatelj odbijen.", ok: false },
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ poruka?: string; n?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [requests, communities, rules, messages, items] = await Promise.all([
    listRequests("pending"),
    listCommunities(),
    listRules(),
    listRecentMessages(30),
    listRecentItems(40),
  ]);
  const related = await Promise.all(requests.map((r) => relatedCommunities(r)));
  const flash = sp.poruka ? FLASH[sp.poruka] : null;
  const year = Number(dateKey(new Date()).slice(0, 4));
  const address = inboundAddress();
  const mode = extractorMode();

  return (
    <div className="admin">
      <div className="pagehead">
        <div className="pagehead__row">
          <h1>Administracija</h1>
          <form action={logoutAction}>
            <button className="btn btn--quiet btn--small" type="submit">
              Odjavi se
            </button>
          </form>
        </div>
      </div>

      {flash ? <div className={flash.ok ? "flash flash--ok" : "flash flash--err"}>{flash.text}</div> : null}

      <div className="paper paper--pad note">
        <p>
          <b>Adresa za objave:</b> {address ?? "nije postavljena (INBOUND_ADDRESS)"} · <b>Čitanje mailova:</b>{" "}
          {mode === "ai" ? `AI (${PROVIDER_LABEL[llmProvider()!]})` : "jednostavna pravila, bez AI-ja (ANTHROPIC_API_KEY ili GEMINI_API_KEY nije postavljen)"} · <b>Obavijesti o zahtjevima:</b>{" "}
          {canSendEmail() && adminEmail() ? `mailom na ${adminEmail()}` : "samo ovdje, u administraciji (za obavijest mailom postavi RESEND_API_KEY i ADMIN_EMAIL)"}
        </p>
        <p>
          <b>Povjerljivi prosljeđivači:</b> {forwarderEmails().join(", ") || "nema"}. Kad oni proslijede tuđi mail, zajednica se određuje prema
          izvornom pošiljatelju.
        </p>
      </div>

      <h2 id="zahtjevi">Zahtjevi za nove zajednice ({requests.length})</h2>
      {requests.length === 0 ? (
        <p className="muted">Nema zahtjeva. Novi nastaje kad stigne mail s domene koja još nema zajednicu.</p>
      ) : (
        <div className="admin__grid">
          {requests.map((r, i) => (
            <RequestForm key={r.id} request={r} communities={communities} related={related[i]} />
          ))}
        </div>
      )}

      <h2 id="test">Testni mail</h2>
      <form action={testMailAction} className="paper paper--pad">
        <p className="note">Prolazi istu obradu kao pravi mail. Korisno za provjeru prije nego što postaviš primanje maila.</p>
        <div className="field">
          <label htmlFor="t-from">Pošiljatelj</label>
          <input id="t-from" name="from" placeholder="Okružnica FSB <okruznica@fsb.unizg.hr>" required />
        </div>
        <div className="field">
          <label htmlFor="t-subject">Naslov</label>
          <input id="t-subject" name="subject" placeholder="Gostujuće predavanje: suradnička robotika" />
        </div>
        <div className="field">
          <label htmlFor="t-text">Tekst maila</label>
          <textarea id="t-text" name="text" required placeholder="Predavanje će se održati 15. 12. 2026. u 14:15 u dvorani A. Prijave do 10. 12. na https://…" />
        </div>
        <button className="btn" type="submit">
          Pošalji testni mail
        </button>
      </form>

      <h2 id="zajednice">Zajednice ({communities.length})</h2>
      {communities.length === 0 ? (
        <p className="muted">Još nema zajednica.</p>
      ) : (
        <div className="admin__grid">
          {communities.map((c) => (
            <details key={c.id} className="paper paper--pad">
              <summary style={{ cursor: "pointer" }}>
                <b>{c.name}</b>{" "}
                <span className="muted small">
                  /z/{c.slug} · {rules.filter((r) => r.communityId === c.id).map((r) => r.value).join(", ") || "bez pravila"}
                </span>
              </summary>
              <form action={saveCommunityAction} style={{ marginTop: 12 }}>
                <input type="hidden" name="communityId" value={c.id} />
                <div className="field">
                  <label htmlFor={`cn-${c.id}`}>Ime</label>
                  <input id={`cn-${c.id}`} name="name" defaultValue={c.name} maxLength={80} required />
                </div>
                <div className="field">
                  <label htmlFor={`cd-${c.id}`}>Kratak opis</label>
                  <input id={`cd-${c.id}`} name="description" defaultValue={c.description} maxLength={400} />
                </div>
                <button className="btn btn--small" type="submit">
                  Spremi
                </button>{" "}
                <Link className="btn btn--quiet btn--small" href={`/z/${c.slug}`}>
                  Otvori
                </Link>
              </form>
            </details>
          ))}
        </div>
      )}

      <h2 id="poruke">Zadnji mailovi</h2>
      <div className="paper tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th>Primljeno</th>
              <th>Pošiljatelj i naslov</th>
              <th>Stanje</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  Još nije stigao nijedan mail.
                </td>
              </tr>
            ) : null}
            {messages.map((m) => (
              <tr key={m.id}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {formatDateShort(dateKey(m.receivedAt), year)} {timeKey(m.receivedAt)}
                </td>
                <td>
                  <b style={{ fontWeight: 600 }}>{m.subject || "(bez naslova)"}</b>
                  <div className="small muted">
                    {m.senderAddress}
                    {m.forwardedBy ? ` (proslijedio ${m.forwardedBy})` : ""}
                    {m.communityName ? ` → ${m.communityName}` : ""}
                  </div>
                  {m.error ? <div className="small" style={{ color: "var(--red)" }}>{m.error}</div> : null}
                </td>
                <td>
                  <span className={STATUS[m.status]?.cls ?? "tag"}>{STATUS[m.status]?.label ?? m.status}</span>
                  {m.extractor ? <div className="small muted">čitanje: {m.extractor}</div> : null}
                </td>
                <td>
                  {["failed", "no_items", "published", "processing"].includes(m.status) ? (
                    <form action={reprocessAction} className="inline">
                      <input type="hidden" name="messageId" value={m.id} />
                      <button className="btn btn--quiet btn--small" type="submit">
                        Obradi ponovno
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="objave">Zadnje objave</h2>
      <div className="paper tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th>Termin</th>
              <th>Objava</th>
              <th>Zajednica</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  Još nema objava.
                </td>
              </tr>
            ) : null}
            {items.map((i) => (
              <tr key={i.id} style={i.status === "hidden" ? { opacity: 0.55 } : undefined}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {formatDateShort(dateKey(i.startsAt), year)} {i.allDay ? "" : timeKey(i.startsAt)}
                </td>
                <td>
                  {i.kind === "deadline" ? <span className="rok">rok </span> : null}
                  <Link href={`/d/${i.id}`}>{i.title}</Link>
                  {i.status === "hidden" ? <span className="tag" style={{ marginLeft: 6 }}>skriveno</span> : null}
                </td>
                <td>{i.communityName}</td>
                <td>
                  <form action={toggleItemAction} className="inline">
                    <input type="hidden" name="itemId" value={i.id} />
                    <button className="btn btn--quiet btn--small" type="submit">
                      {i.status === "published" ? "Sakrij" : "Prikaži"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
