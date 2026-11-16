import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCalendar } from "@/components/AddToCalendar";
import { ItemDetail } from "@/components/ItemDetail";
import { baseUrl } from "@/lib/base-url";
import { eventSpan } from "@/lib/ics";
import { getItem, toIcs, toView } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const row = await getItem((await params).id);
  if (!row) return { title: "Objava ne postoji" };
  const view = toView(row, "");
  return {
    title: `${row.kind === "deadline" ? "Rok: " : ""}${row.title}`,
    description: `${view.when}. ${row.summary}`.trim(),
    openGraph: { title: row.title, description: `${view.when} · ${row.communityName}` },
  };
}

export default async function ItemPage({ params }: Props) {
  const [{ id }, origin] = await Promise.all([params, baseUrl()]);
  const row = await getItem(id);
  if (!row) notFound();
  const item = toView(row, origin);
  const span = eventSpan(toIcs(row));
  const jsonLd =
    row.kind === "event"
      ? {
          "@context": "https://schema.org",
          "@type": "Event",
          name: row.title,
          description: row.summary || row.description,
          startDate: span.allDay ? span.startKey : span.start.toISOString(),
          endDate: span.allDay ? span.endKeyExclusive : span.end.toISOString(),
          eventAttendanceMode: row.onlineUrl && !row.location ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
          location: row.location ? { "@type": "Place", name: row.location } : undefined,
          organizer: { "@type": "Organization", name: row.organizer || row.communityName },
          url: item.pageUrl,
        }
      : null;

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="crumb">
        <Link href={`/z/${row.communitySlug}`}>{row.communityName}</Link>
      </div>
      <div className="paper paper--pad" style={{ padding: 22 }}>
        <ItemDetail item={item} heading="h1" />
        <div style={{ marginTop: 22 }}>
          <AddToCalendar links={item.links} itemId={item.id} />
        </div>
      </div>
      <p className="note" style={{ marginTop: 14 }}>
        Sve objave zajednice: <Link href={`/z/${row.communitySlug}`}>{row.communityName}</Link>
      </p>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /> : null}
    </div>
  );
}
