import { baseUrlFromRequest } from "@/lib/base-url";
import { APP_NAME } from "@/lib/config";
import { buildCalendar, icsResponse } from "@/lib/ics";
import { startOfToday } from "@/lib/time";
import { getUserByFeedToken, userState } from "@/lib/users";
import { getCommunitiesBySlugs, getCommunityBySlug, listItems, scopeFor, scopeForIds, toIcs, type Scope } from "@/lib/queries";

export const dynamic = "force-dynamic";

const DAY = 24 * 3600_000;

/**
 * Kalendari za pretplatu:
 *   /ics/<zajednica>.ics   jedna zajednica (organizacija ili tema)
 *   /ics/sve.ics           sve zajednice
 *   /ics/moj.ics?k=<tajna>  osobni kalendar prijavljenog korisnika (praćene zajednice + spremljeni događaji)
 *   /ics/moj.ics?z=a&z=b    izbor zajednica bez računa
 * Dodatno: ?vrsta=rokovi ili ?vrsta=dogadaji
 */
export async function GET(request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!file.endsWith(".ics")) return new Response("Not found", { status: 404 });
  const name = file.slice(0, -4).toLowerCase();
  const url = new URL(request.url);
  const vrsta = url.searchParams.get("vrsta");
  const kind = vrsta === "rokovi" ? "deadline" : vrsta === "dogadaji" ? "event" : undefined;

  let scope: Scope = {};
  let title = APP_NAME;
  let personal = false;
  if (name === "moj") {
    const token = url.searchParams.get("k");
    if (token) {
      // Osobni kalendar prijavljenog korisnika: tajna adresa, uvijek aktualan izbor.
      const user = await getUserByFeedToken(token);
      if (!user) return new Response("Kalendar ne postoji ili je adresa zamijenjena.", { status: 404 });
      const state = await userState(user.id);
      scope = { ...(await scopeForIds(state.follows)), itemIds: state.saved };
      title = `${APP_NAME}: moj kalendar`;
      personal = true;
    } else {
      const chosen = await getCommunitiesBySlugs(url.searchParams.getAll("z").flatMap((z) => z.split(",")));
      scope = scopeFor(chosen);
      title = chosen.length ? `${APP_NAME}: ${chosen.map((c) => c.name).join(", ")}` : `${APP_NAME}: moj kalendar`;
    }
  } else if (name !== "sve") {
    const community = await getCommunityBySlug(name);
    if (!community) return new Response("Zajednica ne postoji.", { status: 404 });
    scope = scopeFor([community]);
    title = community.name;
  }
  if (kind === "deadline") title += " (rokovi)";

  // Zadržavamo i nedavno prošle stavke da ne nestaju iz kalendara čim prođu.
  const rows = await listItems({ ...scope, kind, from: new Date(startOfToday().getTime() - 30 * DAY), limit: 500 });
  const body = buildCalendar({ name: title, items: rows.map(toIcs), baseUrl: baseUrlFromRequest(request) });
  const res = icsResponse(body, file);
  // Osobni kalendar ne smije ostati u zajedničkim predmemorijama.
  if (personal) res.headers.set("Cache-Control", "private, max-age=300");
  return res;
}
