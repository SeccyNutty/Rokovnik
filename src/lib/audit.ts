import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

/** Zapis u dnevnik radnji. Nikad ne ruši radnju koju bilježi. */
export async function audit(actor: string, action: string, target = "", detail = ""): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(auditLog).values({ actor: actor.slice(0, 200), action, target: target.slice(0, 300), detail: detail.slice(0, 1000) });
  } catch (e) {
    console.error("Dnevnik radnji nije zapisan:", e);
  }
}
