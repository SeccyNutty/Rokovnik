"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { communities, items } from "@/db/schema";
import { isAdmin, requireAdmin } from "@/lib/auth";
import { baseUrl } from "@/lib/base-url";
import { adminPassword, isProd } from "@/lib/config";
import { approveRequest, ingestEmail, processMessage, rejectRequest } from "@/lib/pipeline";
import { createSessionValue, safeEqual, SESSION_COOKIE, SESSION_MAX_AGE, verifyRequestToken } from "@/lib/tokens";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

// Ograničenje pokušaja prijave po IP adresi (u memoriji procesa).
const attempts = new Map<string, { n: number; until: number }>();

export async function loginAction(form: FormData): Promise<void> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.until > now && a.n >= 8) redirect("/admin/prijava?greska=previse");
  const expected = adminPassword();
  const given = str(form, "lozinka");
  if (!expected || !given || !safeEqual(given, expected)) {
    attempts.set(ip, { n: a && a.until > now ? a.n + 1 : 1, until: now + 10 * 60_000 });
    redirect("/admin/prijava?greska=lozinka");
  }
  attempts.delete(ip);
  (await cookies()).set(SESSION_COOKIE, createSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
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
    revalidatePath("/", "layout");
    redirect(`${back}?poruka=odbijeno`);
  }
  const result = await approveRequest(
    requestId,
    { name: str(form, "name"), slug: str(form, "slug"), existingCommunityId: str(form, "existing") || null },
    { baseUrl: await baseUrl() },
  );
  revalidatePath("/", "layout");
  if (!result) redirect(`${back}?poruka=vec-rijeseno`);
  redirect(`${back}?poruka=potvrdeno&z=${result.community.slug}&n=${result.published}`);
}

export async function reprocessAction(form: FormData): Promise<void> {
  await requireAdmin();
  const result = await processMessage(str(form, "messageId"));
  revalidatePath("/", "layout");
  redirect(`/admin?poruka=${result.status === "failed" ? "obrada-greska" : "obradeno"}#poruke`);
}

export async function toggleItemAction(form: FormData): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  const id = str(form, "itemId");
  const [row] = await db.select({ status: items.status }).from(items).where(eq(items.id, id));
  if (row) {
    await db
      .update(items)
      .set({ status: row.status === "published" ? "hidden" : "published", updatedAt: new Date() })
      .where(eq(items.id, id));
  }
  revalidatePath("/", "layout");
  redirect("/admin#objave");
}

export async function saveCommunityAction(form: FormData): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  const name = str(form, "name").slice(0, 80);
  if (name) {
    await db
      .update(communities)
      .set({ name, description: str(form, "description").slice(0, 400) })
      .where(eq(communities.id, str(form, "communityId")));
  }
  revalidatePath("/", "layout");
  redirect("/admin?poruka=spremljeno#zajednice");
}

/** Testni mail: prolazi istu obradu kao pravi, bez postavljanja primanja maila. */
export async function testMailAction(form: FormData): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/prijava");
  const from = str(form, "from");
  const text = str(form, "text");
  if (!from.includes("@") || !text) redirect("/admin?poruka=test-nepotpun#test");
  const result = await ingestEmail(
    { provider: "test", providerId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, from, subject: str(form, "subject"), text, receivedAt: new Date() },
    { baseUrl: await baseUrl() },
  );
  revalidatePath("/", "layout");
  redirect(`/admin?poruka=test-${result.status}&n=${result.itemIds.length}`);
}
