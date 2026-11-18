import type { Metadata } from "next";
import Link from "next/link";
import { CalendarView, type SearchParams } from "@/components/CalendarView";
import { MyCalendarPicker } from "@/components/MyCalendarPicker";
import { Subscribe } from "@/components/Subscribe";
import { currentUser } from "@/lib/auth";
import { baseUrl } from "@/lib/base-url";
import { googleConfigured } from "@/lib/google";
import { listCommunities, scopeFor } from "@/lib/queries";
import { userState } from "@/lib/users";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moj kalendar" };

/** Moj kalendar: zajednice koje pratim i događaji koje sam dodao. Vezan je uz račun. */
export default async function MyCalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, communities, origin, user] = await Promise.all([searchParams, listCommunities(), baseUrl(), currentUser()]);

  if (!user) {
    return (
      <div className="paper empty">
        <h1 style={{ marginBottom: 10 }}>Moj kalendar</h1>
        <p>Prati zajednice i spremaj pojedine događaje na jedno mjesto, dostupno na svim tvojim uređajima. Za to trebaš račun.</p>
        {googleConfigured() ? (
          <a className="btn btn--google" href="/api/auth/google?next=/moj">
            Prijavi se putem Googlea
          </a>
        ) : (
          <Link className="btn" href="/prijava?next=/moj">
            Prijava
          </Link>
        )}
        <p className="small muted" style={{ marginTop: 14 }}>
          Kalendare zajednica možeš pregledavati i dodati u svoju kalendarsku aplikaciju i bez računa.
        </p>
      </div>
    );
  }

  const state = await userState(user.id);
  const chosen = communities.filter((c) => state.follows.includes(c.id));
  const hasAny = chosen.length > 0 || state.saved.length > 0;
  const scope = scopeFor(chosen);
  const picker = <MyCalendarPicker options={communities} selected={chosen.map((c) => c.slug)} />;

  return (
    <div className="split">
      <div>
        <div className="pagehead">
          <h1>Moj kalendar</h1>
          <p className="lead">Zajednice koje pratiš i događaji koje si dodao gumbom „Dodaj u Moj kalendar”.</p>
        </div>
        {communities.length ? (
          <div className="only-mobile" style={{ marginBottom: 16 }}>
            {picker}
          </div>
        ) : null}
        {hasAny ? (
          <CalendarView
            basePath="/moj"
            params={params}
            communityIds={scope.communityIds}
            anyTags={scope.anyTags}
            itemIds={state.saved}
            showCommunity
            empty={
              <div className="empty">
                <h3>Nema nadolazećih objava</h3>
                <p>Zajednice koje pratiš i spremljeni događaji trenutno nemaju nadolazećih termina.</p>
              </div>
            }
          />
        ) : (
          <div className="paper empty">
            <h3>Zaprati zajednicu ili dodaj događaj</h3>
            <p>Označi zajednicu ili otvori bilo koji događaj i klikni „Dodaj u Moj kalendar”.</p>
            <Link className="btn" href="/">
              Pregledaj zajednice
            </Link>
          </div>
        )}
      </div>
      <aside className="split__aside">
        {communities.length ? (
          <div className="only-desktop" style={{ marginBottom: 16 }}>
            <h2 className="aside__title">Zajednice koje pratim</h2>
            {picker}
          </div>
        ) : null}
        <Subscribe baseUrl={origin} feedPath={`/ics/moj.ics?k=${user.feedToken}`} name="Rokovnik: moj kalendar" label="Dodaj sve u svoj kalendar" block />
        <p className="note" style={{ marginTop: 12 }}>
          Jedna pretplata za sve što pratiš i spremiš. Kasnije promjene stižu same. <Link href="/racun">Moj račun</Link>
        </p>
      </aside>
    </div>
  );
}
