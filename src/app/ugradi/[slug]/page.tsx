import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { CalendarView, type SearchParams } from "@/components/CalendarView";
import { EmbedResizer } from "@/components/EmbedResizer";
import { baseUrl } from "@/lib/base-url";
import { APP_NAME } from "@/lib/config";
import { getCommunityBySlug, scopeFor } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Kalendar zajednice za ugradnju na tuđu stranicu (okvir koji postavlja /widget.js ili ručni iframe).
 * Postavke u adresi:
 *   prikaz=mjesec        mjesečni prikaz umjesto popisa
 *   vrsta=rokovi|dogadaji
 *   broj=1..50           najviše stavki u popisu
 *   kontrole=ne          bez filtara i izbora prikaza
 *   tema=tamna
 *   boja=2343d3          boja isticanja (hex bez #)
 *   wid=...              oznaka okvira, za automatsku visinu
 */
export default async function EmbedPage({ params, searchParams }: Props) {
  const [{ slug }, sp, origin] = await Promise.all([params, searchParams, baseUrl()]);
  const community = await getCommunityBySlug(slug);
  if (!community) notFound();
  const limit = Math.min(Math.max(Number(one(sp.broj)) || 12, 1), 50);
  const color = one(sp.boja);
  const style = color && /^[0-9a-f]{6}$/i.test(color) ? ({ "--pen": `#${color}`, "--pen-dark": `#${color}` } as CSSProperties) : undefined;
  const wid = (one(sp.wid) ?? "").replace(/[^a-z0-9-]/gi, "").slice(0, 40);

  return (
    <div className={one(sp.tema) === "tamna" ? "embed embed--dark" : "embed"} style={style}>
      <EmbedResizer id={wid} />
      <CalendarView
        basePath={`/ugradi/${community.slug}`}
        params={sp}
        {...scopeFor([community])}
        showCommunity={community.kind === "topic"}
        limit={limit}
        external
        hideControls={one(sp.kontrole) === "ne"}
        empty={
          <div className="empty">
            <p>Trenutno nema nadolazećih objava.</p>
          </div>
        }
      />
      <div className="embed__foot">
        <a href={`${origin}/z/${community.slug}`} target="_blank" rel="noopener">
          Cijeli kalendar i pretplata
        </a>
        <span className="muted">{APP_NAME}</span>
      </div>
    </div>
  );
}
