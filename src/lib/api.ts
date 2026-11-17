/** Zajedničko za javni API (v1): otvoren za čitanje s bilo koje stranice, kratko predmemoriran. */
export const API_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
};

export function apiJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: API_HEADERS });
}

export function apiOptions(): Response {
  return new Response(null, { status: 204, headers: API_HEADERS });
}
