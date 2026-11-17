import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WidgetBuilder } from "@/components/WidgetBuilder";
import { baseUrl } from "@/lib/base-url";
import { getCommunityBySlug } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ugradi kalendar" };

/** Konektor za stranice organizacija: slaganje koda kojim se kalendar zajednice ugrađuje na vlastitu domenu. */
export default async function EmbedBuilderPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, origin] = await Promise.all([params, baseUrl()]);
  const community = await getCommunityBySlug(slug);
  if (!community) notFound();
  return (
    <div>
      <div className="pagehead">
        <div className="crumb">
          <Link href={`/z/${community.slug}`}>{community.name}</Link>
        </div>
        <h1>Ugradi kalendar na svoju stranicu</h1>
        <p className="lead">Jedan redak koda i kalendar zajednice {community.name} živi na tvojoj domeni. Objave i dalje šalješ običnim mailom.</p>
      </div>
      <WidgetBuilder origin={origin} slug={community.slug} name={community.name} />
      <div className="paper paper--pad note" style={{ marginTop: 22 }}>
        <p>
          <b>Želiš vlastiti dizajn?</b> Podaci su dostupni i kao JSON:{" "}
          <a href={`${origin}/api/v1/zajednice/${community.slug}/stavke`}>{`${origin}/api/v1/zajednice/${community.slug}/stavke`}</a>
        </p>
        <p style={{ marginBottom: 0 }}>
          Parametri: <code>vrsta=rokovi|dogadaji</code>, <code>od</code> i <code>do</code> (YYYY-MM-DD), <code>broj</code> (do 200). Čitanje je dopušteno s bilo koje
          stranice (CORS).
        </p>
      </div>
    </div>
  );
}
