"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { actorLabel, clearUserCookies, isAdmin, requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { baseUrl } from "@/lib/base-url";
import { allow } from "@/lib/ratelimit";
import { adminPassword, isProd } from "@/lib/config";
import { approveRequest, ingestEmail, processMessage, rejectRequest } from "@/lib/pipeline";
import { createSessionValue, safeEqual, SESSION_COOKIE, SESSION_MAX_AGE, verifyRequestToken } from "@/lib/tokens";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/**
 * Rezervna prijava administratora lozinkom. Pokušaji su ograničeni u bazi (vrijedi za sve
 * instance poslužitelja): 8 po adresi u 10 minuta i 40 ukupno na sat.
 */
export async function loginAction(form: FormData): Promise<void> {
  const h = await headers();
  const ip = (h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for") ?? "lokalno").split(",")[0].trim();
  if (!(await allow(`admin-lozinka:${ip}`, 8, 600)) || !(await allow("admin-lozinka:svi", 40, 3600))) redirect("/admin/prijava?greska=previse");
  const expected = adminPassword();
  const given = str(form, "lozinka");
  if (!expected || !given || !safeEqual(given, expected)) {
    await audit(`ip ${ip}`, "admin-prijava-neuspjela");
    redirect("/admin/prijava?greska=lozinka");
  }
  (await cookies()).set(SESSION_COOKIE, createSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  await audit("admin (lozinka)", "admin-prijava");
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  await clearUserCookies();
  redirect("/");
}

/** Potvrda ili odbijanje zahtjeva: iz administracije (sesija) ili preko poveznice iz maila (potpisani token). */
export async function decideRequestAction(form: FormData): Promise<void> {
  const token = str(form, "token");
  const tokenId = token ? verifyRequestToken(token) : null;
  const requestId = tokenId ?? str(form, "requestId");
  if (!tokenId) await requireAdmin();
  if (!requestId) redirect("/admin");

  const back = tokenId ? `/potvrdi/${token}` : "/admin";
  if (str(form, "odluka") === "odbij") {
    await rejectRequest(requestId);
    await audit(tokenId ? "poveznica iz maila" : await actorLabel(), "zahtjev-odbijen", requestId);
    revalidatePath("/", "layout");
    redirect(`${back}?poruka=odbijeno`);
  }
  const result = await approveRequest(
    requestId,
    {
      name: str(form, "name"),
      slug: str(form, "slug"),
      existingCommunityId: str(form, "existing") || null,
      // AI čitanje mailova na čekanju traje nekoliko sekundi: radi se nakon odgovora, da potvrda bude trenutna.
      defer: (work) =>
        after(async () => {
          await work();
          revalidatePath("/", "layout");
        }),
    },
    { baseUrl: await baseUrl() },
  );
  revalidatePath("/", "layout");
  if (!result) redirect(`${back}?poruka=vec-rijeseno`);
  await audit(tokenId ? "poveznica iz maila" : await actorLabel(), "zajednica-potvrdena", result.community.slug);
  redirect(`${back}?poruka=potvrdeno&z=${result.community.slug}&n=${result.published}&c=${result.deferred}`);
}

export async function reprocessAction(form: FormData): Promise<void> {
  await requireAdmin();
  const result = await processMessage(str(form, "messageId"));
  revalidatePath("/", "layout");
  redirect(`/admin?poruka=${result.status === "failed" ? "obrada-greska" : "obradeno"}#poruke`);
}

/** Testni mail: prolazi istu obradu kao pravi, bez postavljanja primanja maila. */
export async function testMailAction(form: FormData): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/prijava");
  const from = str(form, "from");
  const text = str(form, "text");
  if (!from.includes("@") || !text) redirect("/admin?poruka=test-nepotpun#test");
  const result = await ingestEmail(
    { provider: "test", providerId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, from, subject: str(form, "subject"), text, receivedAt: new Date(), trusted: true },
    { baseUrl: await baseUrl() },
  );
  revalidatePath("/", "layout");
  redirect(`/admin?poruka=test-${result.status}&n=${result.itemIds.length}`);
}
