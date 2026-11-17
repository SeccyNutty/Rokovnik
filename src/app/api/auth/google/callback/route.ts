import { cookies } from "next/headers";
import { audit } from "@/lib/audit";
import { baseUrlFromRequest } from "@/lib/base-url";
import { isProd } from "@/lib/config";
import { completeLogin, googleConfigured, STATE_COOKIE } from "@/lib/google";
import { createUserSession, HINT_COOKIE, safeNext, USER_COOKIE, USER_SESSION_MAX_AGE } from "@/lib/session";
import { setFollow, setSaved, upsertUser } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Povratak s Googlea: provjera, otvaranje računa i radnja zbog koje se korisnik prijavio. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = baseUrlFromRequest(request);
  const store = await cookies();
  const stateCookie = store.get(STATE_COOKIE)?.value;
  store.delete({ name: STATE_COOKIE, path: "/api/auth" });
  if (!googleConfigured()) return Response.redirect(`${origin}/prijava?greska=nije-postavljeno`, 302);
  if (url.searchParams.get("error")) return Response.redirect(`${origin}/prijava?greska=odustao`, 302);

  try {
    const { identity, intent } = await completeLogin({
      redirectUri: `${origin}/api/auth/google/callback`,
      stateCookie,
      state: url.searchParams.get("state"),
      code: url.searchParams.get("code"),
    });
    const user = await upsertUser(identity);
    const secure = isProd && origin.startsWith("https");
    store.set(USER_COOKIE, createUserSession(user), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: USER_SESSION_MAX_AGE });
    store.set(HINT_COOKIE, "1", { httpOnly: false, sameSite: "lax", secure, path: "/", maxAge: USER_SESSION_MAX_AGE });
    await audit(user.email, "prijava", user.role);

    let done = "";
    const [kind, value] = intent.action.split(":");
    if (kind === "spremi" && (await setSaved(user.id, value, true))) done = "spremljeno";
    if (kind === "prati" && (await setFollow(user.id, value, true))) done = "praceno";
    const next = safeNext(intent.next);
    const sep = next.includes("?") ? "&" : "?";
    return Response.redirect(`${origin}${next}${done ? `${sep}prijava=${done}` : ""}`, 302);
  } catch (e) {
    console.error("Prijava putem Googlea nije uspjela:", e);
    return Response.redirect(`${origin}/prijava?greska=neuspjelo`, 302);
  }
}
