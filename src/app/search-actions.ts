"use server";

import { headers } from "next/headers";
import { audit } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { baseUrl } from "@/lib/base-url";
import { requestOrganization, type OrgRequestResult } from "@/lib/org-requests";
import { allow } from "@/lib/ratelimit";

export type OrgRequestActionResult = OrgRequestResult | { ok: false; reason: "limit" };

/**
 * Posjetitelj traži da se organizacija pridruži. Dopušteno i gostima, uz zaštitu od zloupotrebe:
 * skriveno polje za botove, 5 zahtjeva na sat po adresi i 100 dnevno ukupno.
 */
export async function requestOrganizationAction(input: { name: string; website?: string; note?: string; email?: string; hp?: string }): Promise<OrgRequestActionResult> {
  // Skriveno polje vidi samo bot: tiho "uspije", bez zapisa.
  if (input.hp) return { ok: true, count: 1 };
  const h = await headers();
  const ip = (h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for") ?? "lokalno").split(",")[0].trim();
  if (!(await allow(`trazena:${ip}`, 5, 3600)) || !(await allow("trazena:svi", 100, 24 * 3600))) return { ok: false, reason: "limit" };
  const user = await currentUser();
  const result = await requestOrganization(
    { name: String(input.name ?? ""), website: String(input.website ?? ""), note: String(input.note ?? ""), email: String(input.email ?? "") || user?.email || "" },
    { baseUrl: await baseUrl() },
  );
  if (result.ok) await audit(user?.email ?? `ip ${ip}`, "trazena-organizacija", input.name.slice(0, 120), `zahtjeva: ${result.count}`);
  return result;
}
