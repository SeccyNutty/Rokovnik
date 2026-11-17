import { apiJson, apiOptions } from "@/lib/api";
import { baseUrlFromRequest } from "@/lib/base-url";
import { getCommunityBySlug, listItems } from "@/lib/queries";
import { isValidDateKey, startOfToday, zonedToUtc, addDays } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/zajednice/<adresa>/stavke: događaji i rokovi jedne zajednice kao JSON,
 * za one koji kalendar žele prikazati vlastitim dizajnom.
 *   ?vrsta=rokovi|dogadaji   ?od=YYYY-MM-DD (zadano: danas)   ?do=YYYY-MM-DD   ?broj=1..200 (zadano 50)
 */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const community = await getCommunityBySlug(slug);
  if (!community) return apiJson({ greska: "Zajednica ne postoji." }, 404);

  const url = new URL(request.url);
  const vrsta = url.searchParams.get("vrsta");
  const kind = vrsta === "rokovi" ? "deadline" : vrsta === "dogadaji" ? "event" : undefined;
  const od = url.searchParams.get("od");
  const d0 = url.searchParams.get("do");
  if ((od && !isValidDateKey(od)) || (d0 && !isValidDateKey(d0))) return apiJson({ greska: "Datumi moraju biti oblika YYYY-MM-DD." }, 400);
  const limit = Math.min(Math.max(Number(url.searchParams.get("broj")) || 50, 1), 200);

  const origin = baseUrlFromRequest(request);
  const rows = await listItems({
    communityIds: [community.id],
    kind,
    from: od ? zonedToUtc(od) : startOfToday(),
    to: d0 ? zonedToUtc(addDays(d0, 1)) : undefined,
    limit,
  });
  return apiJson({
    zajednica: { adresa: community.slug, ime: community.name, stranica: `${origin}/z/${community.slug}` },
    stavke: rows.map((r) => ({
      id: r.id,
      vrsta: r.kind === "deadline" ? "rok" : "dogadaj",
      naslov: r.title,
      sazetak: r.summary,
      opis: r.description,
      pocetak: r.startsAt.toISOString(),
      kraj: r.endsAt ? r.endsAt.toISOString() : null,
      cijeliDan: r.allDay,
      mjesto: r.location,
      online: r.onlineUrl,
      prijava: r.registrationUrl,
      organizator: r.organizer,
      kategorija: r.category,
      stranica: `${origin}/d/${r.id}`,
      ics: `${origin}/ics/d/${r.id}.ics`,
      azurirano: r.updatedAt.toISOString(),
    })),
  });
}

export const OPTIONS = apiOptions;
