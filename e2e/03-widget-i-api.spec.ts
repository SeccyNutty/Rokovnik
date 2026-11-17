import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { LECTURE, ORG, WORKSHOP } from "./helpers";

/** Konektor za stranice organizacija: widget.js, okvir za ugradnju i javni JSON API. */

const hostPage = (origin: string, attrs: string) => `<!doctype html><html lang="hr"><body style="margin:0;font-family:sans-serif">
  <h1>Stranica organizacije</h1>
  <script async src="${origin}/widget.js" data-rokovnik="${ORG.slug}" ${attrs}></script>
  <p id="ispod">Tekst ispod kalendara</p></body></html>`;

/** "Tuđa stranica": mali poslužitelj na drugoj adresi (drugi origin) koji ugrađuje widget. */
let host: Server;
let hostUrl = "";
let attrs = "";
let rokovnik = "";

test.beforeAll(async () => {
  host = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(hostPage(rokovnik, attrs));
  });
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  hostUrl = `http://127.0.0.1:${(host.address() as AddressInfo).port}/`;
});
test.afterAll(async () => {
  await new Promise((resolve) => host.close(resolve));
});

test("widget na tuđoj stranici: kalendar se pojavi i sam prilagodi visinu", async ({ page, baseURL, context }) => {
  rokovnik = baseURL!;
  attrs = "";
  await page.goto(hostUrl);
  const frameEl = page.locator("iframe");
  await expect(frameEl).toHaveAttribute("src", new RegExp(`/ugradi/${ORG.slug}\\?wid=rk-1`));
  const frame = page.frameLocator("iframe");
  await expect(frame.getByRole("button", { name: new RegExp(WORKSHOP) })).toBeVisible();
  // Početna visina je 420 px; nakon poruke iz okvira mora odgovarati sadržaju.
  await expect.poll(async () => frameEl.evaluate((f: HTMLIFrameElement) => parseInt(f.style.height, 10))).not.toBe(420);
  const inner = await frame.locator("html").evaluate((el) => Math.ceil(el.getBoundingClientRect().height));
  const outer = await frameEl.evaluate((f: HTMLIFrameElement) => parseInt(f.style.height, 10));
  expect(Math.abs(outer - inner)).toBeLessThanOrEqual(2);

  // Klik na stavku otvara stranicu događaja u novoj kartici.
  const [popup] = await Promise.all([context.waitForEvent("page"), frame.getByRole("button", { name: new RegExp(WORKSHOP) }).click()]);
  await popup.waitForLoadState();
  expect(popup.url()).toMatch(/\/d\/[0-9a-f-]{36}/);
});

test("widget postavke: samo rokovi, bez kontrola, tamna tema, mjesec", async ({ page, baseURL }) => {
  rokovnik = baseURL!;
  attrs = 'data-vrsta="rokovi" data-kontrole="ne" data-tema="tamna" data-boja="#0a7d4f"';
  await page.goto(hostUrl);
  await expect(page.locator("iframe")).toHaveAttribute("src", /vrsta=rokovi.*kontrole=ne.*tema=tamna.*boja=0a7d4f/);
  const frame = page.frameLocator("iframe");
  await expect(frame.locator(".embed--dark")).toBeVisible();
  await expect(frame.locator(".controls")).toHaveCount(0);
  await expect(frame.locator(".entry--rok")).toHaveCount(await frame.locator(".entry").count());

  await page.goto(`/ugradi/${ORG.slug}?prikaz=mjesec`);
  await expect(page.locator(".month__grid")).toBeVisible();
});

test("slaganje koda za ugradnju daje ispravan kôd i pregled", async ({ page, baseURL }) => {
  await page.goto(`/z/${ORG.slug}`);
  await page.getByRole("link", { name: "Ugradi ovaj kalendar na svoju stranicu" }).click();
  await expect(page.getByRole("heading", { name: "Ugradi kalendar na svoju stranicu" })).toBeVisible();
  const code = page.getByTestId("widget-code");
  await expect(code).toHaveText(`<script async src="${baseURL}/widget.js" data-rokovnik="${ORG.slug}"></script>`);
  await page.getByLabel("Prikaz", { exact: true }).selectOption("mjesec");
  await page.getByLabel("Što prikazati").selectOption("rokovi");
  await expect(code).toContainText('data-prikaz="mjesec" data-vrsta="rokovi"');
  await expect(page.frameLocator('iframe[title="Pregled ugrađenog kalendara"]').locator(".month__grid")).toBeVisible();
});

test("javni API: zajednice i stavke kao JSON, dostupno s bilo koje stranice", async ({ request }) => {
  const list = await request.get("/api/v1/zajednice");
  expect(list.headers()["access-control-allow-origin"]).toBe("*");
  const { zajednice } = await list.json();
  const org = zajednice.find((z: { adresa: string }) => z.adresa === ORG.slug);
  expect(org).toMatchObject({ ime: ORG.name });
  expect(org.nadolazece).toBeGreaterThanOrEqual(3);

  const res = await request.get(`/api/v1/zajednice/${ORG.slug}/stavke`);
  const data = await res.json();
  const titles = data.stavke.map((s: { naslov: string }) => s.naslov);
  expect(titles).toContain(WORKSHOP);
  expect(titles).toContain(LECTURE);
  const workshop = data.stavke.find((s: { naslov: string }) => s.naslov === WORKSHOP);
  expect(workshop).toMatchObject({ vrsta: "dogadaj", cijeliDan: false });
  expect(new Date(workshop.pocetak).getTime()).toBeGreaterThan(Date.now());
  expect(workshop.stranica).toMatch(/\/d\/[0-9a-f-]{36}$/);

  const rokovi = await (await request.get(`/api/v1/zajednice/${ORG.slug}/stavke?vrsta=rokovi`)).json();
  expect(rokovi.stavke.every((s: { vrsta: string }) => s.vrsta === "rok")).toBeTruthy();
  expect((await request.get("/api/v1/zajednice/ne-postoji/stavke")).status()).toBe(404);
  expect((await request.get(`/api/v1/zajednice/${ORG.slug}/stavke?od=sutra`)).status()).toBe(400);
});

test("widget.js se poslužuje kao skripta s predmemorijom", async ({ request }) => {
  const res = await request.get("/widget.js");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("javascript");
  expect(res.headers()["cache-control"]).toContain("max-age=3600");
});
