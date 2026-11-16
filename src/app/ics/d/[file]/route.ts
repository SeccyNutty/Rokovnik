import { baseUrlFromRequest } from "@/lib/base-url";
import { buildCalendar, icsResponse } from "@/lib/ics";
import { getItem, toIcs } from "@/lib/queries";
import { slugify } from "@/lib/sender";

export const dynamic = "force-dynamic";

/** Jedan događaj kao .ics datoteka ("Dodaj u moj kalendar" za Apple i ostale kalendare). */
export async function GET(request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const item = await getItem(file.replace(/\.ics$/, ""));
  if (!item) return new Response("Stavka ne postoji.", { status: 404 });
  const body = buildCalendar({ name: item.title, items: [toIcs(item)], baseUrl: baseUrlFromRequest(request) });
  return icsResponse(body, `${slugify(item.title)}.ics`, true);
}
