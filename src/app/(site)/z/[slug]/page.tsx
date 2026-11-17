import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarView, type SearchParams } from "@/components/CalendarView";
import { FollowButton } from "@/components/FollowButton";
import { Subscribe } from "@/components/Subscribe";
import { baseUrl } from "@/lib/base-url";
import { inboundAddress } from "@/lib/config";
import { getCommunityBySlug } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const community = await getCommunityBySlug((await params).slug);
  if (!community) return { title: "Zajednica ne postoji" };
  return { title: community.name, description: community.description || `Događaji i rokovi zajednice ${community.name}.` };
}

export default async function CommunityPage({ params, searchParams }: Props) {
  const [{ slug }, sp, origin] = await Promise.all([params, searchParams, baseUrl()]);
  const community = await getCommunityBySlug(slug);
  if (!community) notFound();
  const address = inboundAddress();

  return (
    <div className="split">
      <div>
        <div className="pagehead">
          <div className="crumb">
            <Link href="/">Sve zajednice</Link>
          </div>
          <h1>{community.name}</h1>
          {community.description ? <p className="lead">{community.description}</p> : null}
          <div className="only-mobile" style={{ marginTop: 14 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <FollowButton slug={community.slug} name={community.name} block />
              <Subscribe baseUrl={origin} feedPath={`/ics/${community.slug}.ics`} name={community.name} block />
            </div>
          </div>
        </div>
        <CalendarView
          basePath={`/z/${community.slug}`}
          params={sp}
          communityIds={[community.id]}
          showCommunity={false}
          empty={
            <div className="empty">
              <h3>Nema nadolazećih objava</h3>
              <p>Kad {community.name} pošalje obavijest o događaju ili roku, pojavit će se ovdje i u kalendarima svih koji prate zajednicu.</p>
            </div>
          }
        />
      </div>
      <aside className="split__aside">
        <div className="only-desktop">
<div style={{ marginBottom: 8 }}>
            <FollowButton slug={community.slug} name={community.name} block />
          </div>
          <Subscribe baseUrl={origin} feedPath={`/ics/${community.slug}.ics`} name={community.name} block />
          <p className="note" style={{ marginTop: 12 }}>
            Kalendar dodaješ jednom, a nove objave stižu same. Pojedini događaj možeš dodati i zasebno: klikni na njega.
          </p>
        </div>
        <div className="paper paper--pad note" style={{ marginTop: 16 }}>
          <p>
            <b>Za organizatore.</b> Objava je običan mail{address ? <> na <b>{address}</b></> : null}: sustav sam pročita događaj i rokove.{" "}
            <Link href="/objavi">Kako to radi</Link>
          </p>
          <p className="note" style={{ marginTop: 14 }}>
            <Link href={`/z/${community.slug}/ugradi`}>Ugradi ovaj kalendar na svoju stranicu</Link>
          </p>
        </div>
      </aside>
    </div>
  );
}
