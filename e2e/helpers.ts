import { createHmac } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const SECRET = "e2e-tajna-za-potpis";
export const ADMIN_PASSWORD = "e2e-lozinka";

/** Zajednica koju priprema 01-tok i koriste ostali testovi. */
export const ORG = { domain: "fakultet.example", name: "Fakultet", slug: "fakultet" };
export const LECTURE = "Gostujuce predavanje o robotici";
export const WORKSHOP = "Radionica 3D ispisa";

const pad = (n: number) => String(n).padStart(2, "0");

/** Datum za `days` dana od danas (uvijek u budućnosti, pa testovi ne zastarijevaju). */
export function future(days: number) {
  const d = new Date(Date.now() + days * 24 * 3600_000);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return { hr: `${day}. ${m}. ${y}.`, key: `${y}-${pad(m)}-${pad(day)}`, month: `${y}-${pad(m)}`, day };
}

let counter = 0;

/** Šalje mail u sustav istim putem kao pravi ulaz: potpisan zahtjev na /api/inbound/generic. */
export async function sendMail(request: APIRequestContext, mail: { from: string; subject: string; text: string }, signature?: string) {
  const body = JSON.stringify({ messageId: `e2e-${Date.now()}-${++counter}`, date: new Date().toISOString(), ...mail });
  const sig = signature ?? `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
  return request.post("/api/inbound/generic", { data: body, headers: { "content-type": "application/json", "x-signature": sig } });
}

export async function loginAdmin(page: Page) {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Administracija" })).toBeVisible();
  await page.getByLabel("Lozinka").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(page.getByRole("button", { name: "Odjavi se" })).toBeVisible();
}

/** Stranica ne smije imati vodoravni klizač (česta greška na mobitelu). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "stranica je šira od ekrana").toBeLessThanOrEqual(1);
}
