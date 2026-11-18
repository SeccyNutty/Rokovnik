import { apiJson, apiOptions } from "@/lib/api";
import { baseUrlFromRequest } from "@/lib/base-url";
import { listCommunities } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** GET /api/v1/zajednice: popis zajednica s brojem nadolazećih objava. */
export async function GET(request: Request) {
  const origin = baseUrlFromRequest(request);
  const rows = await listCommunities();
  return apiJson({
    zajednice: rows.map((c) => ({
      adresa: c.slug,
      ime: c.name,
      opis: c.description,
      vrsta: c.kind === "topic" ? "tema" : "organizacija",
      oznake: c.kind === "topic" ? c.topicTags : undefined,
      nadolazece: c.upcoming,
      stranica: `${origin}/z/${c.slug}`,
      kalendar: `${origin}/ics/${c.slug}.ics`,
      stavke: `${origin}/api/v1/zajednice/${c.slug}/stavke`,
    })),
  });
}

export const OPTIONS = apiOptions;
