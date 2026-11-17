import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/db";
import { communities, communityManagers, items } from "@/db/schema";
import { allow } from "@/lib/ratelimit";
import { createUserSession, readUserSession, safeNext } from "@/lib/session";
import { requestToken, verifyRequestToken } from "@/lib/tokens";
import { accountKind, canManage, deleteUser, getUserByFeedToken, revokeSessions, rotateFeedToken, setFollow, setSaved, upsertUser, userState, getUser } from "@/lib/users";

const ana = { sub: "g-1", email: "ana@gmail.com", name: "Ana Anić" };

beforeEach(async () => {
  await resetDbForTests();
  delete process.env.ADMIN_EMAILS;
  delete process.env.ADMIN_EMAIL;
});

describe("računi i uloge", () => {
  it("prva prijava stvara račun, sljedeća ga osvježava", async () => {
    const a = await upsertUser(ana);
    const b = await upsertUser({ ...ana, name: "Ana A." });
    expect(b.id).toBe(a.id);
    expect(b.name).toBe("Ana A.");
    expect(a.role).toBe("user");
    expect(a.feedToken.length).toBeGreaterThanOrEqual(20);
  });

  it("administrator je onaj čija je adresa u ADMIN_EMAILS; uklanjanjem s popisa gubi ulogu", async () => {
    process.env.ADMIN_EMAILS = "sef@firma.hr, ANA@gmail.com";
    expect((await upsertUser(ana)).role).toBe("admin");
    delete process.env.ADMIN_EMAILS;
    expect((await upsertUser(ana)).role).toBe("user");
  });

  it("tri vrste računa: korisnik, organizacija (upravlja zajednicom), admin", async () => {
    const db = await resetDbForTests();
    const user = await upsertUser(ana);
    const [c] = await db.insert(communities).values({ slug: "fsb", name: "FSB" }).returning();
    const [other] = await db.insert(communities).values({ slug: "unizg", name: "UNIZG" }).returning();
    expect(await accountKind(user)).toBe("korisnik");
    expect(await canManage(user, c.id)).toBe(false);

    await db.insert(communityManagers).values({ communityId: c.id, email: "ana@gmail.com" });
    expect(await accountKind(user)).toBe("organizacija");
    expect(await canManage(user, c.id)).toBe(true);
    expect(await canManage(user, other.id)).toBe(false);

    process.env.ADMIN_EMAIL = "ana@gmail.com";
    const admin = await upsertUser(ana);
    expect(await accountKind(admin)).toBe("admin");
    expect(await canManage(admin, other.id)).toBe(true);
  });

  it("praćenje zajednica i spremanje događaja vezani su uz račun", async () => {
    const db = await resetDbForTests();
    const user = await upsertUser(ana);
    const [c] = await db.insert(communities).values({ slug: "fsb", name: "FSB" }).returning();
    const [item] = await db
      .insert(items)
      .values({ communityId: c.id, kind: "event", title: "Predavanje", startsAt: new Date("2030-01-01T10:00:00Z"), dedupeKey: "k1" })
      .returning();
    const [hidden] = await db
      .insert(items)
      .values({ communityId: c.id, kind: "event", title: "Skriveno", startsAt: new Date("2030-01-02T10:00:00Z"), dedupeKey: "k2", status: "hidden" })
      .returning();

    expect(await setFollow(user.id, "fsb", true)).toBe(true);
    expect(await setFollow(user.id, "ne-postoji", true)).toBe(false);
    expect(await setSaved(user.id, item.id, true)).toBe(true);
    expect(await setSaved(user.id, hidden.id, true)).toBe(false);
    expect(await userState(user.id)).toMatchObject({ followSlugs: ["fsb"], saved: [item.id] });

    await setSaved(user.id, item.id, false);
    await setFollow(user.id, "fsb", false);
    expect(await userState(user.id)).toMatchObject({ followSlugs: [], saved: [] });
  });

  it("brisanje računa uklanja i njegove podatke", async () => {
    const db = await resetDbForTests();
    const user = await upsertUser(ana);
    await db.insert(communities).values({ slug: "fsb", name: "FSB" });
    await setFollow(user.id, "fsb", true);
    await deleteUser(user.id);
    expect(await getUser(user.id)).toBeNull();
    expect(await getUserByFeedToken(user.feedToken)).toBeNull();
  });
});

describe("prijave i tokeni", () => {
  it("kolačić prijave: ispravan se čita, izmijenjen i istekao ne", async () => {
    const user = await upsertUser(ana);
    const cookie = createUserSession(user);
    expect(readUserSession(cookie)).toMatchObject({ uid: user.id, email: "ana@gmail.com" });
    const forged = Buffer.from(JSON.stringify({ uid: user.id, email: "admin@x.hr", name: "", epoch: 0, exp: Date.now() + 1e9 })).toString("base64url");
    expect(readUserSession(`${forged}.${cookie.split(".")[1]}`)).toBeNull();
    expect(readUserSession(cookie, Date.now() + 31 * 24 * 3600_000)).toBeNull();
    expect(readUserSession(undefined)).toBeNull();
  });

  it("odjava sa svih uređaja poništava postojeće prijave", async () => {
    const user = await upsertUser(ana);
    const session = readUserSession(createUserSession(user))!;
    await revokeSessions(user.id);
    expect((await getUser(user.id))!.sessionEpoch).not.toBe(session.epoch);
  });

  it("zamjena adrese osobnog kalendara gasi staru", async () => {
    const user = await upsertUser(ana);
    await rotateFeedToken(user.id);
    expect(await getUserByFeedToken(user.feedToken)).toBeNull();
    expect((await getUserByFeedToken((await getUser(user.id))!.feedToken))?.id).toBe(user.id);
    expect(await getUserByFeedToken("' or 1=1 --")).toBeNull();
  });

  it("odredište nakon prijave smije biti samo putanja ove stranice", () => {
    expect(safeNext("/z/fsb?prikaz=mjesec")).toBe("/z/fsb?prikaz=mjesec");
    for (const bad of ["https://zlo.example", "//zlo.example", "/\\zlo.example", "javascript:alert(1)", "/api/auth/google", "", null]) expect(safeNext(bad)).toBe("/");
  });

  it("poveznica za potvrdu zajednice istječe nakon 30 dana", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const token = requestToken(id);
    expect(verifyRequestToken(token)).toBe(id);
    expect(verifyRequestToken(token, Date.now() + 31 * 24 * 3600_000)).toBeNull();
    const [, exp, sig] = token.split(".");
    expect(verifyRequestToken(`${id}.${Number(exp) + 1000}.${sig}`)).toBeNull();
  });

  it("ograničenje učestalosti: dopušta do granice, pa odbija, pa se nakon isteka prozora vraća", async () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    for (let i = 0; i < 3; i++) expect(await allow("test:kljuc", 3, 60, t0)).toBe(true);
    expect(await allow("test:kljuc", 3, 60, t0)).toBe(false);
    expect(await allow("test:drugi", 3, 60, t0)).toBe(true);
    expect(await allow("test:kljuc", 3, 60, new Date(t0.getTime() + 61_000))).toBe(true);
  });
});
