import type { Metadata } from "next";
import Link from "next/link";
import { CalendarView, type SearchParams } from "@/components/CalendarView";
import { MyCalendarPicker } from "@/components/MyCalendarPicker";
import { Subscribe } from "@/components/Subscribe";
import { baseUrl } from "@/lib/base-url";
import { listCommunities } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moj kalendar" };

export default async function MyCalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, communities, origin] = await Promise.all([searchParams, listCommunities(), baseUrl()]);
  const raw = params.z === undefined ? [] : Array.isArray(params.z) ? params.z : [params.z];
  const wanted = raw.flatMap((z) => z.split(",")).filter(Boolean);
  const chosen = communities.filter((c) => wanted.includes(c.slug));
  const feedPath = `/ics/moj.ics?${chosen.map((c) => `z=${c.slug}`).join("&")}`;

  if (!communities.length) {
    return (
      <div className="paper empty">
        <h1 style={{ marginBottom: 10 }}>Moj kalendar</h1>
        <p>Još nema zajednica koje bi mogao pratiti.</p>
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
          <h1>Moj kalendar</h1>
          <p className="lead">Označi zajednice koje pratiš. Njihovi događaji i rokovi slažu se u jedan kalendar, bez prijave.</p>
        </div>
        <div className="only-mobile" style={{ marginBottom: 16 }}>
          <MyCalendarPicker options={communities} selected={chosen.map((c) => c.slug)} hasParam={params.z !== undefined} />
        </div>
        {chosen.length ? (
          <CalendarView
            basePath="/moj"
            params={params}
            communityIds={chosen.map((c) => c.id)}
            showCommunity
            empty={
              <div className="empty">
                <h3>Nema nadolazećih objava</h3>
                <p>Odabrane zajednice trenutno nemaju najavljenih događaja ni rokova.</p>
              </div>
            }
          />
        ) : (
          <div className="paper empty">
            <h3>Odaberi barem jednu zajednicu</h3>
            <p>Tvoj izbor ostaje zapamćen na ovom uređaju.</p>
          </div>
        )}
      </div>
      <aside className="split__aside">
        <div className="only-desktop" style={{ marginBottom: 16 }}>
          <h2 className="aside__title">Zajednice koje pratim</h2>
          <MyCalendarPicker options={communities} selected={chosen.map((c) => c.slug)} hasParam={params.z !== undefined} />
        </div>
        {chosen.length ? (
          <>
            <Subscribe baseUrl={origin} feedPath={feedPath} name="Moj kalendar" label="Dodaj sve u svoj kalendar" block />
            <p className="note" style={{ marginTop: 12 }}>
              Jedna pretplata za sve odabrane zajednice. Ako kasnije promijeniš izbor, dodaj kalendar ponovno.
            </p>
          </>
        ) : null}
      </aside>
    </div>
  );
}
