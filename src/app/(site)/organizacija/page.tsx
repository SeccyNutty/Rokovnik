import type { Metadata } from "next";
import Link from "next/link";
import { toggleItemAction } from "@/app/community-actions";
import { CommunitySettings } from "@/components/CommunitySettings";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth";
import { inboundAddress } from "@/lib/config";
import { listCommunities, listHeldMessages, listItemsForManager, listManagers, listRulesFor } from "@/lib/queries";
import { dateKey, formatDateShort, timeKey } from "@/lib/time";
import { managedCommunities } from "@/lib/users";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moje zajednice", robots: { index: false } };

const FLASH: Record<string, { text: string; ok: boolean }> = {
  spremljeno: { text: "Spremljeno.", ok: true },
  objavljeno: { text: "Mail je objavljen.", ok: true },
  "bez-stavki": { text: "Mail je obrađen, ali u njemu nije pronađen datum događaja ni rok.", ok: false },
  odbaceno: { text: "Mail je odbačen.", ok: true },
  "adresa-neispravna": { text: "Adresa nije ispravna.", ok: false },
  "adresa-tuda": { text: "Možeš dodati samo adrese s domene svoje zajednice. Za druge adrese javi se administratoru.", ok: false },
  "adresa-zauzeta": { text: "Ta adresa već pripada nekoj zajednici.", ok: false },
  "nema-ovlasti": { text: "Za tu radnju trebaš ovlasti administratora.", ok: false },
};

/** Račun organizacije: upravljanje zajednicama koje su korisniku dodijeljene. */
export default async function OrganizationPage({ searchParams }: { searchParams: Promise<{ poruka?: string }> }) {
  const user = await requireUser("/organizacija");
  const sp = await searchParams;
  const admin = user.role === "admin";
  const mine = admin ? await listCommunities() : await managedCommunities(user.email);
  const ids = mine.map((c) => c.id);
  const [rules, held, managers, items] = await Promise.all([listRulesFor(ids), listHeldMessages(ids), admin ? listManagers(ids) : Promise.resolve([]), listItemsForManager(ids)]);
  const flash = sp.poruka ? FLASH[sp.poruka] : null;
  const address = inboundAddress();

  return (
    <div className="admin">
      <div className="pagehead">
        <h1>Moje zajednice</h1>
        <p className="lead">
          Objave i dalje šalješ običnim mailom{address ? ` na ${address}` : ""}. Ovdje uređuješ zajednicu, odlučuješ o mailovima koji čekaju i sakrivaš pogrešne objave.
        </p>
      </div>
      {flash ? <div className={flash.ok ? "flash flash--ok" : "flash flash--err"}>{flash.text}</div> : null}

      {mine.length === 0 ? (
        <div className="paper empty">
          <h3>Ne upravljaš nijednom zajednicom</h3>
          <p>Upravljanje zajednicom dodjeljuje administrator, na tvoju Google adresu ({user.email}).</p>
          <Link className="btn" href="/objavi">
            Kako objaviti
          </Link>
        </div>
      ) : (
        <div className="admin__grid">
          {mine.map((c) => (
            <div key={c.id} className="paper paper--pad">
              <h2 style={{ marginTop: 0 }}>{c.name}</h2>
              <CommunitySettings
                community={c}
                rules={rules.filter((r) => r.communityId === c.id)}
                held={held.filter((h) => h.communityId === c.id)}
                managers={managers.filter((m) => m.communityId === c.id)}
                admin={admin}
                from="organizacija"
              />
            </div>
          ))}
        </div>
      )}

      {items.length ? (
        <>
          <h2 id="objave">Objave</h2>
          <div className="paper tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Termin</th>
                  <th>Naslov</th>
                  <th>Zajednica</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {formatDateShort(dateKey(i.startsAt))} {i.allDay ? "" : timeKey(i.startsAt)}
                    </td>
                    <td>
                      {i.kind === "deadline" ? <span className="rok">rok</span> : null} {i.title}
                      {i.status === "hidden" ? <span className="tag"> skriveno</span> : null}
                    </td>
                    <td>{i.communityName}</td>
                    <td>
                      <form action={toggleItemAction} className="inline">
                        <input type="hidden" name="itemId" value={i.id} />
                        <SubmitButton className="btn btn--quiet btn--small" pending="…">
                          {i.status === "published" ? "Sakrij" : "Prikaži"}
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
