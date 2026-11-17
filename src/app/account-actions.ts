"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { clearUserCookies, currentUser } from "@/lib/auth";
import { allow } from "@/lib/ratelimit";
import { deleteUser, revokeSessions, rotateFeedToken, setFollow, setSaved } from "@/lib/users";

export type ToggleResult = { ok: true; on: boolean } | { ok: false; reason: "login" | "limit" };

/** Dodavanje događaja u Moj kalendar (ili uklanjanje). Gost dobiva odgovor da se treba prijaviti. */
export async function toggleSavedAction(itemId: string, on: boolean): Promise<ToggleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "login" };
  if (!(await allow(`radnja:${user.id}`, 300, 3600))) return { ok: false, reason: "limit" };
  return { ok: true, on: await setSaved(user.id, itemId, on) };
}

export async function toggleFollowAction(slug: string, on: boolean): Promise<ToggleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "login" };
  if (!(await allow(`radnja:${user.id}`, 300, 3600))) return { ok: false, reason: "limit" };
  return { ok: true, on: await setFollow(user.id, slug, on) };
}

export async function logoutUserAction(): Promise<void> {
  await clearUserCookies();
  redirect("/");
}

export async function logoutEverywhereAction(): Promise<void> {
  const user = await currentUser();
  if (user) {
    await revokeSessions(user.id);
    await audit(user.email, "odjava-svugdje");
  }
  await clearUserCookies();
  redirect("/");
}

export async function rotateFeedAction(): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/prijava?next=/racun");
  await rotateFeedToken(user.id);
  redirect("/racun?poruka=nova-adresa");
}

export async function deleteAccountAction(form: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/prijava?next=/racun");
  if (String(form.get("potvrda") ?? "").trim().toUpperCase() !== "OBRIŠI") redirect("/racun?poruka=potvrda");
  await deleteUser(user.id);
  await audit(user.email, "brisanje-racuna");
  await clearUserCookies();
  redirect("/?racun=obrisan");
}
