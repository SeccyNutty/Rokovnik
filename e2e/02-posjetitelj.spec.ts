import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, future, LECTURE, nextGoogleUser, ORG, userFor, WORKSHOP } from "./helpers";

/** Ono što vidi posjetitelj, na računalu i na mobitelu (isti testovi u oba projekta). */

test("naslovnica: zajednice i nadolazeće objave", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Što slijedi i do kada se prijaviti" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(ORG.name) }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(LECTURE) }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("filtar Rokovi prikazuje samo rokove, Događaji samo događaje", async ({ page }) => {
  await page.goto(`/z/${ORG.slug}`);
  const all = await page.locator(".entry").count();
  await page.locator(".chips").getByRole("link", { name: "Rokovi" }).click();
  await expect(page).toHaveURL(/vrsta=rokovi/);
  await expect(page.locator(".entry--rok")).toHaveCount(await page.locator(".entry").count());
  expect(await page.locator(".entry").count()).toBeGreaterThan(0);
  await page.locator(".chips").getByRole("link", { name: "Događaji" }).click();
  await expect(page).toHaveURL(/vrsta=dogadaji/);
  await expect(page.locator(".entry--rok")).toHaveCount(0);
  await page.locator(".chips").getByRole("link", { name: "Sve", exact: true }).click();
  await expect(page.locator(".entry")).toHaveCount(all);
});

test("mjesečni prikaz: dan s događajem pokazuje taj događaj", async ({ page }) => {
  const d = future(25);
  await page.goto(`/z/${ORG.slug}?prikaz=mjesec&m=${d.month}`);
  await expect(page.locator(".month__grid")).toBeVisible();
  await page.locator(`.cell[href*="dan=${d.key}"]`).click();
  await expect(page).toHaveURL(new RegExp(`dan=${d.key}`));
  await expect(page.getByRole("button", { name: new RegExp(WORKSHOP) })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("klik na događaj otvara opis s poveznicama za kalendare", async ({ page, request }) => {
  await page.goto(`/z/${ORG.slug}`);
  await page.getByRole("button", { name: new RegExp(WORKSHOP) }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: WORKSHOP })).toBeVisible();
  await expect(dialog).toContainText("16:00");
  await dialog.getByRole("button", { name: /Dodaj u moj kalendar|Drugi/ }).click();

  const google = dialog.getByRole("link", { name: "Google kalendar" });
  await expect(google).toHaveAttribute("href", /calendar\.google\.com.*Radionica/);
  await expect(dialog.getByRole("link", { name: "Outlook.com" })).toHaveAttribute("href", /outlook\.live\.com/);
  const ics = await dialog.getByRole("link", { name: /Apple i ostali/ }).getAttribute("href");
  const file = await request.get(ics!);
  expect(file.headers()["content-type"]).toContain("text/calendar");
  const body = await file.text();
  expect(body).toContain("BEGIN:VEVENT");
  expect(body).toContain(WORKSHOP);
});

test("gost: Dodaj u Moj kalendar traži prijavu, a nakon prijave putem Googlea događaj je spremljen", async ({ page }, info) => {
  await page.goto(`/z/${ORG.slug}`);
  await page.getByRole("button", { name: new RegExp(WORKSHOP) }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Dodaj u moj kalendar" }).click();
  await dialog.getByRole("button", { name: "Moj kalendar u Rokovniku" }).click();

  const prompt = page.getByRole("dialog", { name: "Za Moj kalendar trebaš račun" });
  await expect(prompt).toBeVisible();
  // Vanjski kalendari i dalje rade bez računa.
  await expect(dialog.getByRole("link", { name: "Google kalendar" })).toHaveCount(1);

  await nextGoogleUser(page.request, userFor(info.project.name, "spremac"));
  await prompt.getByRole("link", { name: "Prijavi se putem Googlea" }).click();
  // Povratak na istu stranicu, radnja je već izvršena.
  await expect(page).toHaveURL(new RegExp(`/z/${ORG.slug}.*prijava=spremljeno`));
  await page.goto("/moj");
  await expect(page.getByRole("button", { name: new RegExp(WORKSHOP) })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(LECTURE) })).toHaveCount(0);

  // Uklanjanje iz Mog kalendara.
  await page.getByRole("button", { name: new RegExp(WORKSHOP) }).click();
  await page.getByRole("dialog").getByRole("button", { name: /U Mom kalendaru/ }).click();
  await expect(page.getByRole("heading", { name: "Zaprati zajednicu ili dodaj događaj" })).toBeVisible();
});

test("gost: Zaprati zajednicu traži prijavu, a nakon prijave zajednica je u Mom kalendaru", async ({ page }, info) => {
  await page.goto(`/z/${ORG.slug}`);
  // Gumb je vidljiv jednom (mobilni i bočni blok ne smiju se prikazati zajedno).
  await expect(page.getByRole("button", { name: "Zaprati zajednicu" })).toHaveCount(1);
  await page.getByRole("button", { name: "Zaprati zajednicu" }).click();
  const prompt = page.getByRole("dialog", { name: "Za praćenje trebaš račun" });
  await expect(prompt).toBeVisible();
  await nextGoogleUser(page.request, userFor(info.project.name, "pratitelj"));
  await prompt.getByRole("link", { name: "Prijavi se putem Googlea" }).click();
  await expect(page).toHaveURL(/prijava=praceno/);
  await expect(page.getByRole("button", { name: /Pratiš/ }).first()).toBeVisible();

  await page.goto("/moj");
  await expect(page.getByRole("checkbox", { name: new RegExp(ORG.name) }).first()).toBeChecked();
  await expect(page.getByRole("button", { name: new RegExp(LECTURE) }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Prestanak praćenja iz Mog kalendara.
  await page.getByRole("checkbox", { name: new RegExp(ORG.name) }).first().click();
  await expect(page.getByRole("heading", { name: "Zaprati zajednicu ili dodaj događaj" })).toBeVisible();
});

test("gost: Moj kalendar nudi prijavu umjesto sadržaja", async ({ page }) => {
  await page.goto("/moj");
  await expect(page.getByRole("link", { name: "Prijavi se putem Googlea" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("stranica događaja radi samostalno, a nepostojeća vraća 404", async ({ page }) => {
  await page.goto(`/z/${ORG.slug}`);
  await page.getByRole("button", { name: new RegExp(WORKSHOP) }).click();
  await page.getByRole("link", { name: "Otvori kao stranicu" }).click();
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { level: 1, name: WORKSHOP })).toBeVisible();
  await expectNoHorizontalScroll(page);
  const missing = await page.request.get("/d/00000000-0000-4000-8000-000000000000");
  expect(missing.status()).toBe(404);
  expect((await page.request.get("/z/ne-postoji")).status()).toBe(404);
});

test("pretplata na kalendar (ICS): događaji i rokovi u ispravnom obliku", async ({ request }) => {
  const res = await request.get(`/ics/${ORG.slug}.ics`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const body = await res.text();
  expect(body.startsWith("BEGIN:VCALENDAR")).toBeTruthy();
  expect(body.trimEnd().endsWith("END:VCALENDAR")).toBeTruthy();
  expect(body).toContain(WORKSHOP);
  expect(body).toMatch(/SUMMARY:ROK: /);
  expect(body.match(/BEGIN:VEVENT/g)!.length).toBeGreaterThanOrEqual(3);
  expect((await request.get("/ics/sve.ics")).status()).toBe(200);
  expect((await request.get("/ics/ne-postoji.ics")).status()).toBe(404);
  // Samo rokovi
  const rokovi = await (await request.get(`/ics/${ORG.slug}.ics?vrsta=rokovi`)).text();
  expect(rokovi).not.toContain(`SUMMARY:${WORKSHOP}`);
});

test("stranice za organizatore i privatnost se otvaraju", async ({ page }) => {
  await page.goto("/objavi");
  await expect(page.getByRole("heading", { name: "Objava je običan mail" })).toBeVisible();
  await expect(page.getByText("objavi@test.rokovnik.example").first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto("/privatnost");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("sigurnosna zaglavlja: obične stranice se ne mogu ugraditi u tuđi okvir", async ({ request }) => {
  const home = await request.get("/");
  expect(home.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  expect(home.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
  expect(home.headers()["content-security-policy"]).toContain("object-src 'none'");
  expect(home.headers()["strict-transport-security"]).toContain("max-age=");
  const embed = await request.get(`/ugradi/${ORG.slug}`);
  expect(embed.headers()["x-frame-options"]).toBeUndefined();
  expect(embed.headers()["content-security-policy"]).toContain("frame-ancestors *");
});
