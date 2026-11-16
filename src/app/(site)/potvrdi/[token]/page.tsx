import type { Metadata } from "next";
import Link from "next/link";
import { RequestForm } from "@/components/RequestForm";
import { getDb } from "@/db";
import { communities } from "@/db/schema";
import { getRequest, relatedCommunities } from "@/lib/queries";
import { verifyRequestToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Potvrda zajednice", robots: { index: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ poruka?: string; z?: string; n?: string; c?: string }> };

/** Stranica iz poveznice u mailu administratoru: potvrda nove zajednice jednim klikom, bez prijave. */
export default async function ConfirmPage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const requestId = verifyRequestToken(decodeURIComponent(token));
  const request = requestId ? await getRequest(requestId) : null;

  if (!request) {
    return (
      <div className="paper empty">
        <h1 style={{ marginBottom: 10 }}>Poveznica nije ispravna</h1>
        <p>Zahtjev ne postoji ili je poveznica oštećena. Otvori zahtjeve u administraciji.</p>
        <Link className="btn" href="/admin">
          Administracija
        </Link>
      </div>
    );
  }

  if (request.status !== "pending") {
    const approved = request.status === "approved";
    return (
      <div className="paper empty">
        <h1 style={{ marginBottom: 10 }}>{approved ? "Zajednica je potvrđena" : "Pošiljatelj je odbijen"}</h1>
        {approved ? (
          <>
            <p>
              {sp.n && Number(sp.n) > 0 ? `Objavljeno stavki: ${sp.n}. ` : ""}
              {sp.c && Number(sp.c) > 0 ? "Mailovi na čekanju upravo se obrađuju i pojavit će se u zajednici za nekoliko sekundi. " : ""}Budući mailovi s {request.value} objavljuju se automatski.
            </p>
            {sp.z ? (
              <Link className="btn" href={`/z/${sp.z}`}>
                Otvori zajednicu
              </Link>
            ) : (
              <Link className="btn" href="/">
                Otvori kalendar
              </Link>
            )}
          </>
        ) : (
          <p>Mailovi s {request.value} više se ne obrađuju.</p>
        )}
      </div>
    );
  }

  const db = await getDb();
  const all = await db.select().from(communities).orderBy(communities.name);
  return (
    <div style={{ maxWidth: 640 }}>
      <div className="pagehead">
        <h1>Nova zajednica?</h1>
        <p className="lead">Stigao je mail od pošiljatelja koji još nema zajednicu.</p>
      </div>
      <RequestForm request={request} communities={all} token={decodeURIComponent(token)} related={await relatedCommunities(request)} />
    </div>
  );
}
