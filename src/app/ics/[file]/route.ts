import { baseUrlFromRequest } from "@/lib/base-url";
import { APP_NAME } from "@/lib/config";
import { buildCalendar, icsResponse } from "@/lib/ics";
import { parseSaved } from "@/lib/saved";
import { getCommunitiesBySlugs, getCommunityBySlug, listItems, toIcs } from "@/lib/queries";

export const dynamic = "force-dynamic";

const DAY = 24 * 3600_000;

/**
 * Kalendari za pretplatu:
 *   /ics/<zajednica>.ics   jedna zajednica
 *   /ics/sve.ics           sve zajednice
 *   /ics/moj.ics?z=a&z=b   izbor zajednica ("Moj kalendar"); &s=id.id dodaje pojedinačno spremljene stavke
 * Dodatno: ?vrsta=rokovi ili ?vrsta=dogadaji
 */
export async function GET(request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!file.endsWith(".ics")) return new Response("Not found", { status: 404 });
  const name = file.slice(0, -4).toLowerCase();
  const url = new URL(request.url);
  const vrsta = url.searchParams.get("vrsta");
  const kind = vrsta === "rokovi" ? "deadline" : vrsta === "dogadaji" ? "event" : undefined;

  let communityIds: string[] | undefined;
  let itemIds: string[] | undefined;
  let title = APP_NAME;
  if (name === "moj") {
    const chosen = await getCommunitiesBySlugs(url.searchParams.getAll("z").flatMap((z) => z.split(",")));
    communityIds = chosen.map((c) => c.id);
    itemIds = parseSaved(url.searchParams.get("s"));
    title = chosen.length ? `${APP_NAME}: ${chosen.map((c) => c.name).join(", ")}` : `${APP_NAME}: moj kalendar`;
  } else if (name !== "sve") {
    const community = await getCommunityBySlug(name);
    if (!community) return new Response("Zajednica ne postoji.", { status: 404 });
    communityIds = [community.id];
    title = community.name;
  }
  if (kind === "deadline") title += " (rokovi)";

  // Zadržavamo i nedavno prošle stavke da ne nestaju iz kalendara čim prođu.
  const rows = await listItems({ communityIds, itemIds, kind, from: new Date(Date.now() - 30 * DAY), limit: 500 });
  const body = buildCalendar({ name: title, items: rows.map(toIcs), baseUrl: baseUrlFromRequest(request) });
  return icsResponse(body, file);
}
