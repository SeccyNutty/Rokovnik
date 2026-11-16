import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { extractorMode } from "@/lib/extract";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, baza: "ok", izvlacenje: extractorMode() });
  } catch (e) {
    return Response.json({ ok: false, greska: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
