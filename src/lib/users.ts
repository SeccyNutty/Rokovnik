import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { communities, communityManagers, items, userFollows, userSaved, users, type Community, type User } from "@/db/schema";
import { adminEmails } from "./config";
import type { GoogleIdentity } from "./google";

/** Tri vrste računa. "organizacija" je korisnik koji upravlja barem jednom zajednicom. */
export type AccountKind = "admin" | "organizacija" | "korisnik";

const newFeedToken = () => randomBytes(24).toString("base64url");

/** Prijava: stvara račun pri prvoj prijavi, inače osvježava podatke. Uloga administratora slijedi ADMIN_EMAILS. */
export async function upsertUser(identity: GoogleIdentity): Promise<User> {
  const db = await getDb();
  const role = adminEmails().includes(identity.email) ? "admin" : "user";
  const [bySub] = await db.select().from(users).where(eq(users.googleSub, identity.sub));
  if (bySub) {
    const [row] = await db
      .update(users)
      .set({ email: identity.email, name: identity.name || bySub.name, role, lastLoginAt: new Date() })
      .where(eq(users.id, bySub.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(users)
    .values({ googleSub: identity.sub, email: identity.email, name: identity.name, role, feedToken: newFeedToken() })
    .returning();
  return row;
}

export async function getUser(id: string): Promise<User | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row ?? null;
}

export async function getUserByFeedToken(token: string): Promise<User | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.feedToken, token));
  return row ?? null;
}

export async function rotateFeedToken(userId: string): Promise<void> {
  const db = await getDb();
  await db.update(users).set({ feedToken: newFeedToken() }).where(eq(users.id, userId));
}

/** Odjava sa svih uređaja: sve postojeće prijave prestaju vrijediti. */
export async function revokeSessions(userId: string): Promise<void> {
  const db = await getDb();
  await db.update(users).set({ sessionEpoch: sql`${users.sessionEpoch} + 1` }).where(eq(users.id, userId));
}

export async function deleteUser(userId: string): Promise<void> {
  const db = await getDb();
  await db.delete(users).where(eq(users.id, userId));
}

export async function managedCommunities(email: string): Promise<Community[]> {
  const db = await getDb();
  const rows = await db
    .select({ c: communities })
    .from(communityManagers)
    .innerJoin(communities, eq(communityManagers.communityId, communities.id))
    .where(eq(communityManagers.email, email.toLowerCase()))
    .orderBy(communities.name);
  return rows.map((r) => r.c);
}

export async function accountKind(user: User): Promise<AccountKind> {
  if (user.role === "admin") return "admin";
  return (await managedCommunities(user.email)).length ? "organizacija" : "korisnik";
}

export async function canManage(user: User, communityId: string): Promise<boolean> {
  if (user.role === "admin") return true;
  const db = await getDb();
  const [row] = await db
    .select({ id: communityManagers.id })
    .from(communityManagers)
    .where(and(eq(communityManagers.communityId, communityId), eq(communityManagers.email, user.email)));
  return !!row;
}

// ── Moj kalendar ──────────────────────────────────────────────────────────────

export async function userState(userId: string): Promise<{ follows: string[]; followSlugs: string[]; saved: string[] }> {
  const db = await getDb();
  const [f, s] = await Promise.all([
    db
      .select({ id: communities.id, slug: communities.slug })
      .from(userFollows)
      .innerJoin(communities, eq(userFollows.communityId, communities.id))
      .where(eq(userFollows.userId, userId)),
    db.select({ id: userSaved.itemId }).from(userSaved).where(eq(userSaved.userId, userId)),
  ]);
  return { follows: f.map((r) => r.id), followSlugs: f.map((r) => r.slug), saved: s.map((r) => r.id) };
}

const MAX_SAVED = 500;

export async function setSaved(userId: string, itemId: string, on: boolean): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return false;
  const db = await getDb();
  if (!on) {
    await db.delete(userSaved).where(and(eq(userSaved.userId, userId), eq(userSaved.itemId, itemId)));
    return false;
  }
  const [item] = await db.select({ id: items.id }).from(items).where(and(eq(items.id, itemId), eq(items.status, "published")));
  if (!item) return false;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(userSaved).where(eq(userSaved.userId, userId));
  if (n >= MAX_SAVED) return false;
  await db.insert(userSaved).values({ userId, itemId }).onConflictDoNothing();
  return true;
}

export async function setFollow(userId: string, slug: string, on: boolean): Promise<boolean> {
  const db = await getDb();
  const [c] = await db.select({ id: communities.id }).from(communities).where(eq(communities.slug, slug.toLowerCase()));
  if (!c) return false;
  if (!on) {
    await db.delete(userFollows).where(and(eq(userFollows.userId, userId), eq(userFollows.communityId, c.id)));
    return false;
  }
  await db.insert(userFollows).values({ userId, communityId: c.id }).onConflictDoNothing();
  return true;
}

export async function setFollows(userId: string, communityIds: string[]): Promise<void> {
  const db = await getDb();
  await db.delete(userFollows).where(eq(userFollows.userId, userId));
  if (!communityIds.length) return;
  const valid = await db.select({ id: communities.id }).from(communities).where(inArray(communities.id, communityIds));
  if (valid.length) await db.insert(userFollows).values(valid.map((v) => ({ userId, communityId: v.id }))).onConflictDoNothing();
}
