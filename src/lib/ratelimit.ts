import { sql } from "drizzle-orm";
import { getDb } from "@/db";

/**
 * Ograničenje učestalosti u bazi (radi i kad poslužitelj ima više instanci, za razliku od
 * brojača u memoriji). Vraća true ako je radnja dopuštena: najviše `limit` u `windowSeconds`.
 * Ako baza zakaže, radnju dopuštamo: ograničenje je dodatna zaštita, a ne jedina.
 */
export async function allow(key: string, limit: number, windowSeconds: number, now = new Date()): Promise<boolean> {
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - windowSeconds * 1000).toISOString();
  try {
    const db = await getDb();
    const result = await db.execute(sql`
      insert into rate_limits (key, window_start, count) values (${key.slice(0, 200)}, ${nowIso}::timestamptz, 1)
      on conflict (key) do update set
        count = case when rate_limits.window_start < ${cutoff}::timestamptz then 1 else rate_limits.count + 1 end,
        window_start = case when rate_limits.window_start < ${cutoff}::timestamptz then ${nowIso}::timestamptz else rate_limits.window_start end
      returning count`);
    const rows = (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as { count: number }[];
    return Number(rows[0]?.count ?? 1) <= limit;
  } catch (e) {
    console.error("Ograničenje učestalosti nije provjereno:", e);
    return true;
  }
}
