import Link from "next/link";
import { CalendarView, type SearchParams } from "@/components/CalendarView";
import { CommunityList } from "@/components/CommunityList";
import { Subscribe } from "@/components/Subscribe";
import { baseUrl } from "@/lib/base-url";
import { listCommunities } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, communities, origin] = await Promise.all([searchParams, listCommunities(), baseUrl()]);

  if (!communities.length) {
    return (
      <div className="paper empty">
        <h1 style={{ marginBottom: 10 }}>Još nema nijedne zajednice</h1>
        <p>Zajednica nastaje kad organizacija pošalje prvi mail s događajem ili rokom. Nakon potvrde, objave se pojavljuju ovdje same.</p>
        <Link className="btn" href="/objavi">
          Kako objaviti
        </Link>
      </div>
    );
  }

  return (
    <div className="split">
      <div>
        <div className="pagehead">
          <h1>Što slijedi i do kada se prijaviti</h1>
          <p className="lead">Događaji i rokovi svih zajednica, redom kojim dolaze.</p>
        </div>
        <div className="only-mobile" style={{ marginBottom: 14 }}>
          <CommunityList communities={communities} row />
        </div>
        <CalendarView
          basePath="/"
          params={params}
          showCommunity
          empty={
            <div className="empty">
              <h3>Trenutno nema nadolazećih objava</h3>
              <p>Čim neka zajednica pošalje obavijest o događaju ili roku, pojavit će se ovdje.</p>
            </div>
          }
        />
      </div>
      <aside className="split__aside">
        <div className="only-desktop" style={{ marginBottom: 16 }}>
          <h2 className="aside__title">Zajednice</h2>
          <div className="paper">
            <CommunityList communities={communities} />
          </div>
        </div>
        <div>
          <Subscribe baseUrl={origin} feedPath="/ics/sve.ics" name="Sve zajednice" label="Prati sve u svom kalendaru" block />
        </div>
        <p className="note" style={{ marginTop: 14 }}>
          Zanima te samo dio? Složi <Link href="/moj">svoj kalendar</Link> iz zajednica koje pratiš.
        </p>
      </aside>
    </div>
  );
}
