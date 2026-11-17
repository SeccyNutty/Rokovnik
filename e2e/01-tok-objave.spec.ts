import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, future, LECTURE, loginAdmin, ORG, sendMail, WORKSHOP } from "./helpers";

/**
 * Cijeli tok: mail nepoznate organizacije → zahtjev → potvrda jednim klikom → objava →
 * sljedeći mail iste organizacije objavljuje se sam. Uz to administracija i zaštite.
 */
test.describe.configure({ mode: "serial" });

test("testno okruženje je izolirano (ugrađena baza, bez AI-ja)", async ({ request }) => {
  const health = await (await request.get("/api/health")).json();
  expect(health).toMatchObject({ ok: true, pogon: "pglite", izvlacenje: "pravila" });
});

test("prazan sustav: naslovnica objašnjava kako nastaje zajednica", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Još nema nijedne zajednice" })).toBeVisible();
});

test("mail s neispravnim potpisom se odbija", async ({ request }) => {
  const res = await sendMail(request, { from: `x@${ORG.domain}`, subject: "Lažni", text: "Nešto 1. 1. 2030." }, "sha256=deadbeef");
  expect(res.status()).toBe(401);
});

test("mail nepoznate organizacije čeka potvrdu i ništa se ne objavljuje", async ({ request, page }) => {
  const res = await sendMail(request, {
    from: `Okruznica <okruznica@${ORG.domain}>`,
    subject: LECTURE,
    text: `Pozivamo vas na predavanje ${future(20).hr} u 14:15 u dvorani A. Prijave do ${future(15).hr}`,
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: "pending_community", items: 0 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Još nema nijedne zajednice" })).toBeVisible();
});

test("administracija traži lozinku i odbija krivu", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByLabel("Lozinka")).toBeVisible();
  await page.getByLabel("Lozinka").fill("kriva-lozinka");
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(page).toHaveURL(/greska=lozinka/);
  await expect(page.getByRole("button", { name: "Odjavi se" })).toHaveCount(0);
  expect(ADMIN_PASSWORD).not.toBe("kriva-lozinka");
});

test("potvrda zajednice jednim klikom objavljuje mail na čekanju", async ({ page }) => {
  await loginAdmin(page);
  await expect(page.getByText(`Domena ${ORG.domain}`)).toBeVisible();
  await page.getByLabel("Ime zajednice").fill(ORG.name);
  await page.getByLabel("Adresa stranice").fill(ORG.slug);
  await page.getByRole("button", { name: "Potvrdi zajednicu" }).click();
  await expect(page).toHaveURL(/poruka=potvrdeno/);
  await expect(page.locator(".flash--ok")).toContainText("Zajednica je potvrđena");

  // Obrada ide u pozadini; stranica zajednice je pokaže čim završi.
  await expect(async () => {
    await page.goto(`/z/${ORG.slug}`);
    await expect(page.getByRole("button", { name: new RegExp(LECTURE) }).first()).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  // Iz jednog maila nastaju događaj i rok prijave.
  await expect(page.locator(".entry")).toHaveCount(2);
  await expect(page.locator(".entry--rok")).toHaveCount(1);
});

test("sljedeći mail iste organizacije objavljuje se bez potvrde", async ({ request, page }) => {
  const res = await sendMail(request, {
    from: `Okruznica <okruznica@${ORG.domain}>`,
    subject: WORKSHOP,
    text: `${WORKSHOP} odrzat ce se ${future(25).hr} u 16:00 u laboratoriju.`,
  });
  expect(await res.json()).toMatchObject({ status: "published", items: 1 });
  // Predmemorija se poništava pri objavi: nova stavka je vidljiva odmah.
  await page.goto(`/z/${ORG.slug}`);
  await expect(page.getByRole("button", { name: new RegExp(WORKSHOP) })).toBeVisible();
  await expect(page.locator(".entry")).toHaveCount(3);
});

test("isti mail poslan dvaput ne stvara duplikate", async ({ request, page }) => {
  await sendMail(request, {
    from: `Okruznica <okruznica@${ORG.domain}>`,
    subject: WORKSHOP,
    text: `${WORKSHOP} odrzat ce se ${future(25).hr} u 16:00 u laboratoriju.`,
  });
  await page.goto(`/z/${ORG.slug}`);
  await expect(page.locator(".entry")).toHaveCount(3);
});

test("mail bez datuma ne objavljuje ništa", async ({ request }) => {
  const res = await sendMail(request, { from: `info@${ORG.domain}`, subject: "Pozdrav", text: "Samo javljamo da je sve u redu." });
  expect(await res.json()).toMatchObject({ items: 0 });
});

test("administrator može sakriti i vratiti objavu", async ({ page }) => {
  await loginAdmin(page);
  await page.locator("tr", { hasText: WORKSHOP }).getByRole("button", { name: "Sakrij" }).first().click();
  await page.goto(`/z/${ORG.slug}`);
  await expect(page.getByRole("button", { name: new RegExp(WORKSHOP) })).toHaveCount(0);

  await page.goto("/admin");
  await page.locator("tr", { hasText: WORKSHOP }).getByRole("button", { name: "Prikaži" }).first().click();
  await page.goto(`/z/${ORG.slug}`);
  await expect(page.getByRole("button", { name: new RegExp(WORKSHOP) })).toBeVisible();
});

test("odbijen pošiljatelj: njegovi se mailovi više ne obrađuju", async ({ request, page }) => {
  await sendMail(request, { from: "promo@spam.example", subject: "Akcija", text: `Rasprodaja ${future(5).hr} u 10:00.` });
  await loginAdmin(page);
  await expect(page.getByText("Domena spam.example")).toBeVisible();
  await page.getByRole("button", { name: "Odbij pošiljatelja" }).click();
  await expect(page).toHaveURL(/poruka=odbijeno/);
  const res = await sendMail(request, { from: "promo@spam.example", subject: "Opet", text: `Rasprodaja ${future(6).hr} u 10:00.` });
  expect(await res.json()).toMatchObject({ status: "rejected", items: 0 });
  await page.goto("/");
  await expect(page.getByText("spam", { exact: false })).toHaveCount(0);
});

test("testni mail iz administracije prolazi istu obradu", async ({ page }) => {
  await loginAdmin(page);
  await page.getByLabel("Pošiljatelj", { exact: true }).fill(`Referada <referada@${ORG.domain}>`);
  await page.getByLabel("Naslov").fill("Smotra fakulteta");
  await page.getByLabel("Tekst maila").fill(`Smotra fakulteta odrzat ce se ${future(30).hr} u 10:00 u auli.`);
  await page.getByRole("button", { name: "Pošalji testni mail" }).click();
  await expect(page.locator(".flash--ok")).toContainText("obrađen i objavljen");
});
