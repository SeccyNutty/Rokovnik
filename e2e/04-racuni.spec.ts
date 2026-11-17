import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, future, loginAdmin, loginGoogle, ORG, sendMail, userFor, WORKSHOP } from "./helpers";

/** Tri vrste računa (korisnik, organizacija, administrator), prijava putem Googlea i zaštite. */

test("korisnik: račun, osobni kalendar (ICS), bez pristupa administraciji", async ({ page }, info) => {
  const me = userFor(info.project.name, "korisnik");
  await loginGoogle(page, me);
  await expect(page.getByRole("heading", { name: "Moj račun" })).toBeVisible();
  await expect(page.getByText("Korisnik", { exact: true })).toBeVisible();
  await expect(page.getByText(me.email)).toBeVisible();

  // Osobni kalendar ima tajnu adresu; bez nje ili s krivom nema podataka.
  const feed = await page.locator("[data-feed]").first().getAttribute("data-feed");
  expect(feed).toMatch(/\/ics\/moj\.ics\?k=[A-Za-z0-9_-]{20,}/);
  const ok = await page.request.get(feed!);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["cache-control"]).toContain("private");
  expect((await page.request.get("/ics/moj.ics?k=krivi-kljuc-krivi-kljuc-123")).status()).toBe(404);

  // Administracija i upravljanje zajednicom nisu dostupni.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/prijava/);
  await page.goto("/organizacija");
  await expect(page.getByRole("heading", { name: "Ne upravljaš nijednom zajednicom" })).toBeVisible();

  // Zamjena adrese kalendara gasi staru.
  await page.goto("/racun");
  await page.getByRole("button", { name: "Zamijeni adresu" }).click();
  await expect(page.locator(".flash--ok")).toContainText("zamijenjena");
  expect((await page.request.get(feed!)).status()).toBe(404);

  await page.getByRole("button", { name: "Odjavi se", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.goto("/racun");
  await expect(page).toHaveURL(/\/prijava/);
});

test("administrator putem Googlea; dodjela upravitelja stvara račun organizacije", async ({ page, browser }, info) => {
  await loginGoogle(page, { email: "admin@e2e.example", name: "Admin" }, "/admin");
  await expect(page.getByRole("heading", { name: "Administracija" })).toBeVisible();

  const org = userFor(info.project.name, "urednica");
  const box = page.getByTestId(`zajednica-${ORG.slug}`);
  await page.locator("details", { has: box }).locator("summary").click();
  await box.getByLabel("E-mail Google računa").fill(org.email);
  await box.getByRole("button", { name: "Dodaj upravitelja" }).click();
  await expect(page.locator(".flash--ok")).toBeVisible();

  // Upraviteljica se prijavljuje u svom pregledniku.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await loginGoogle(p2, org, "/organizacija");
  await expect(p2.getByRole("heading", { name: "Moje zajednice" })).toBeVisible();
  await expect(p2.getByRole("heading", { name: ORG.name })).toBeVisible();
  // Organizacija ne mijenja ime zajednice ni strogu provjeru pošiljatelja, ni upravitelje.
  await expect(p2.getByLabel("Ime", { exact: true })).toBeDisabled();
  await expect(p2.getByLabel("Provjera pošiljatelja")).toBeDisabled();
  await expect(p2.getByRole("button", { name: "Dodaj upravitelja" })).toHaveCount(0);
  // I dalje nema pristup administraciji.
  await p2.goto("/admin");
  await expect(p2).toHaveURL(/\/admin\/prijava/);

  // Smije sakriti i vratiti objavu svoje zajednice.
  await p2.goto("/organizacija");
  await p2.locator("tr", { hasText: WORKSHOP }).getByRole("button", { name: "Sakrij" }).first().click();
  await expect(p2.locator(".flash--ok")).toBeVisible();
  await p2.locator("tr", { hasText: WORKSHOP }).getByRole("button", { name: "Prikaži" }).first().click();
  await expect(p2.locator("tr", { hasText: WORKSHOP }).getByRole("button", { name: "Sakrij" }).first()).toBeVisible();

  // Smije dodati adresu sa svoje domene, ali ne tuđu.
  await p2.getByLabel("Nova adresa").fill(`referada.${info.project.name}@${ORG.domain}`);
  await p2.getByRole("button", { name: "Dodaj adresu" }).click();
  await expect(p2.getByText(`referada.${info.project.name}@${ORG.domain}`)).toBeVisible();
  await p2.getByLabel("Nova adresa").fill("netko@drugi-fakultet.example");
  await p2.getByRole("button", { name: "Dodaj adresu" }).click();
  await expect(p2.locator(".flash--err")).toContainText("domene svoje zajednice");
  await ctx.close();
});

test("lažirani pošiljatelj: mail bez DMARC dokaza čeka odluku i ne objavljuje se sam", async ({ page, request }, info) => {
  const subject = `Lazna obavijest ${info.project.name}`;
  const res = await sendMail(request, {
    from: `Dekanat <dekanat@${ORG.domain}>`,
    subject,
    text: `${subject} odrzat ce se ${future(40).hr} u 12:00.`,
    auth: { spf: "pass", dkim: "pass", dmarc: "unknown" },
  });
  expect(await res.json()).toMatchObject({ status: "held", items: 0 });
  // Izričito pala provjera: odbijeno odmah.
  const failed = await sendMail(request, { from: `dekanat@${ORG.domain}`, subject: "Pala provjera", text: `Nesto ${future(41).hr}.`, auth: { spf: "fail", dkim: "fail", dmarc: "fail" } });
  expect(await failed.json()).toMatchObject({ status: "unauthenticated" });

  await page.goto(`/z/${ORG.slug}`);
  await expect(page.getByText(subject)).toHaveCount(0);

  // Administrator pregledava i ručno objavljuje.
  await loginAdmin(page);
  const box = page.getByTestId(`zajednica-${ORG.slug}`);
  const held = box.locator("form", { hasText: subject });
  await expect(held).toBeVisible();
  await held.getByRole("button", { name: "Objavi" }).click();
  await expect(page.locator(".flash--ok")).toContainText("objavljen");
  await page.goto(`/z/${ORG.slug}`);
  await expect(page.getByRole("button", { name: new RegExp(subject) })).toBeVisible();
});

test("zaštite: krivotvoren kolačić, preusmjeravanje van stranice, prijava bez Googlea", async ({ page, context, baseURL }) => {
  // Krivotvoren kolačić prijave ne vrijedi.
  const forged = Buffer.from(JSON.stringify({ uid: "00000000-0000-4000-8000-000000000000", email: "admin@e2e.example", name: "x", epoch: 0, exp: Date.now() + 1e9 })).toString("base64url");
  await context.addCookies([{ name: "rokovnik_sesija", value: `${forged}.lazni-potpis`, url: baseURL! }]);
  await page.goto("/racun");
  await expect(page).toHaveURL(/\/prijava/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/prijava/);

  // Nakon prijave nema preusmjeravanja na tuđu stranicu.
  await loginGoogle(page, { email: "putnik@e2e.example" }, "https://zlo.example/ukradi");
  expect(new URL(page.url()).origin).toBe(baseURL);

  // Povratak s Googlea bez započete prijave (krivotvoren zahtjev) se odbija.
  await page.goto("/api/auth/google/callback?code=abc&state=xyz");
  await expect(page).toHaveURL(/greska=neuspjelo/);

  // API za stanje korisnika gostu ne otkriva ništa.
  const ctx = await page.context().browser()!.newContext();
  const guest = await (await ctx.request.get(`${baseURL}/api/me`)).json();
  expect(guest).toEqual({ user: null });
  await ctx.close();
  expect(ADMIN_PASSWORD).toBeTruthy();
});
