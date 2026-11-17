import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@/db/schema";
import { HINT_COOKIE, readUserSession, USER_COOKIE, type SessionUser } from "./session";
import { SESSION_COOKIE, verifySessionValue } from "./tokens";
import { getUser } from "./users";

/** Tko je prijavljen prema kolačiću (bez upita u bazu). Za prikaz; za ovlasti koristi currentUser(). */
export async function sessionUser(): Promise<SessionUser | null> {
  return readUserSession((await cookies()).get(USER_COOKIE)?.value);
}

/**
 * Prijavljeni korisnik potvrđen u bazi: račun postoji i prijava nije opozvana. Uloga se čita
 * iz baze, pa promjena ovlasti vrijedi odmah, a ne tek kad kolačić istekne.
 */
export async function currentUser(): Promise<User | null> {
  const s = await sessionUser();
  if (!s) return null;
  const user = await getUser(s.uid);
  return user && user.sessionEpoch === s.epoch ? user : null;
}

export async function requireUser(next: string): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/prijava?next=${encodeURIComponent(next)}`);
  return user;
}

/** Administrator: Google račun s ulogom admin ili (rezervno) prijava lozinkom. */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  if (verifySessionValue(store.get(SESSION_COOKIE)?.value)) return true;
  return (await currentUser())?.role === "admin";
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/prijava");
}

/** Tko izvodi radnju, za dnevnik. */
export async function actorLabel(): Promise<string> {
  const user = await currentUser();
  if (user) return user.email;
  return (await isAdmin()) ? "admin (lozinka)" : "nepoznato";
}

export async function clearUserCookies(): Promise<void> {
  const store = await cookies();
  store.delete(USER_COOKIE);
  store.delete(HINT_COOKIE);
}
