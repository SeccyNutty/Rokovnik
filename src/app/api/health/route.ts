import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { extractorMode } from "@/lib/extract";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    // Pet upita odjednom, kao na stranici /admin: provjerava i usporedne upite preko poolera.
    await Promise.all([1, 2, 3, 4, 5].map((n) => db.execute(sql`select ${n}::int`)));
    return Response.json({ ok: true, baza: "ok", izvlacenje: extractorMode() });
  } catch (e) {
    return Response.json({ ok: false, greska: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
