import { apiJson, apiOptions } from "@/lib/api";
import { TAGS } from "@/lib/tags";

/** GET /api/v1/oznake: popis tema (oznaka) koje objave mogu imati. */
export function GET() {
  return apiJson({ oznake: TAGS.map((t) => ({ kljuc: t.key, naziv: t.label })) });
}

export const OPTIONS = apiOptions;
