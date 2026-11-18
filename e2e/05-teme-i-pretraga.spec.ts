import { expect, test } from "@playwright/test";
import { LECTURE, loginAdmin, ORG, TOPIC, WORKSHOP } from "./helpers";

/** Pretraga zajednica, zahtjev za novu organizaciju, teme (oznake) i tematske zajednice. */

test("pretraga zajednica: po dijelu naziva, bez dijakritika; nepostojeća nudi zahtjev", async ({ page }) => {
  await page.goto("/");
  const search = page.locator("input[type=search]:visible");
  await search.fill("fakul");
  await expect(page.locator(`a[href="/z/${ORG.slug}"]:visible`).first()).toBeVisible();
  await expect(page.locator(`a[href="/z/${TOPIC.slug}"]:visible`)).toHaveCount(0);

  await search.fill("RADIONICE");
  await expect(page.locator(`a[href="/z/${TOPIC.slug}"]:visible`).first()).toBeVisible();
  await expect(page.locator(".clist__kind:visible").first()).toHaveText("tema");

  await search.fill("Nepostojeća udruga");
  await expect(page.getByText("Nema zajednice „Nepostojeća udruga”.").locator("visible=true")).toBeVisible();
  await expect(page.locator("button:visible", { hasText: "Zatraži da se pridruži" })).toBeVisible();
});

test("zahtjev da se organizacija pridruži stiže administratoru", async ({ page, browser }, info) => {
  const name = `Tehničko veleučilište Zagreb ${info.project.name}`;
  await page.goto("/");
  await page.locator("input[type=search]:visible").fill(name);
  await page.locator("button:visible", { hasText: "Zatraži da se pridruži" }).click();
  const form = page.locator("form.orgreq:visible");
  await expect(form.getByLabel("Naziv organizacije")).toHaveValue(name);
  await form.getByLabel(/Mrežna stranica/).fill("https://www.tvz.hr");
  await form.getByLabel(/Tvoj e-mail/).fill(`student.${info.project.name}@e2e.example`);
  await form.getByRole("button", { name: "Pošalji zahtjev" }).click();
  await expect(form.getByRole("status")).toContainText("Zahtjev je zabilježen");

  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await loginAdmin(admin);
  const row = admin.locator("#trazene ~ div tr", { hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText("https://www.tvz.hr");
  await ctx.close();
});

test("filtar po temi u kalendaru zajednice", async ({ page }) => {
  await page.goto(`/z/${ORG.slug}`);
  const tags = page.getByRole("group", { name: "Tema" });
  await tags.getByRole("link", { name: /Radionica/ }).click();
  await expect(page).toHaveURL(/tema=radionica/);
  await expect(page.getByRole("button", { name: new RegExp(WORKSHOP) })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(LECTURE) })).toHaveCount(0);
  await tags.getByRole("link", { name: "Sve teme" }).click();
  await expect(page.getByRole("button", { name: new RegExp(LECTURE) }).first()).toBeVisible();
});

test("tematska zajednica skuplja objave organizacija i radi kao obična", async ({ page, request }) => {
  await page.goto(`/z/${TOPIC.slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(TOPIC.name);
  await expect(page.getByText("Objave svih organizacija s oznakom")).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(WORKSHOP) })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(LECTURE) })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Zaprati zajednicu" })).toHaveCount(1);

  const ics = await (await request.get(`/ics/${TOPIC.slug}.ics`)).text();
  expect(ics).toContain(WORKSHOP);
  expect(ics).not.toContain(`SUMMARY:${LECTURE}`);
  const { zajednice } = await (await request.get("/api/v1/zajednice")).json();
  expect(zajednice.find((z: { adresa: string }) => z.adresa === TOPIC.slug)).toMatchObject({ vrsta: "tema", oznake: ["radionica"] });
  const stavke = await (await request.get(`/api/v1/zajednice/${TOPIC.slug}/stavke`)).json();
  expect(stavke.stavke.map((s: { naslov: string }) => s.naslov)).toContain(WORKSHOP);
  expect(stavke.stavke[0].organizacija).toBe(ORG.name);
});

test("oznake na objavi vode na sve objave te teme", async ({ page }) => {
  await page.goto(`/z/${ORG.slug}`);
  await page.getByRole("button", { name: new RegExp(LECTURE) }).filter({ hasNotText: "Prijave" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("list", { name: "Teme" })).toContainText("Karijera i praksa");
  await dialog.getByRole("link", { name: "Karijera i praksa" }).click();
  await expect(page).toHaveURL(/\/\?tema=karijera/);
  await expect(page.getByRole("button", { name: new RegExp(LECTURE) }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(WORKSHOP) })).toHaveCount(0);
});
