import { cookies } from "next/headers";
import { baseUrlFromRequest } from "@/lib/base-url";
import { isProd } from "@/lib/config";
import { beginLogin, googleConfigured, STATE_COOKIE } from "@/lib/google";
import { allow } from "@/lib/ratelimit";
import { safeNext } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Radnja koju korisnik želi nakon prijave: "spremi:<id stavke>" ili "prati:<adresa zajednice>". */
function safeAction(a: string | null): string {
  return a && /^(spremi:[0-9a-f-]{36}|prati:[a-z0-9-]{1,60})$/i.test(a) ? a.toLowerCase() : "";
}

/** Početak prijave putem Googlea. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const origin = baseUrlFromRequest(request);
  if (!googleConfigured()) return Response.redirect(`${origin}/prijava?greska=nije-postavljeno&next=${encodeURIComponent(next)}`, 302);
  const ip = (request.headers.get("x-nf-client-connection-ip") ?? request.headers.get("x-forwarded-for") ?? "lokalno").split(",")[0].trim();
  if (!(await allow(`prijava:${ip}`, 30, 600))) return Response.redirect(`${origin}/prijava?greska=previse`, 302);

  const { url: target, cookie } = beginLogin(`${origin}/api/auth/google/callback`, { next, action: safeAction(url.searchParams.get("akcija")) });
  (await cookies()).set(STATE_COOKIE, cookie, { httpOnly: true, sameSite: "lax", secure: isProd && origin.startsWith("https"), path: "/api/auth", maxAge: 600 });
  return Response.redirect(target, 302);
}
