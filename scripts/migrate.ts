/** Primjenjuje migracije na Postgres bazu iz DATABASE_URL. Pokreni: pnpm db:migrate */
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("DATABASE_URL nije postavljen: lokalna baza (PGlite) migrira se sama pri pokretanju.");
    return;
  }
  const client = postgres(url, { max: 1, prepare: false });
  await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await client.end();
  console.log("Migracije su primijenjene.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
