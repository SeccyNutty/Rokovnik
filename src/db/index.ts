import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Jedna baza, dva pogona:
 *  - DATABASE_URL postavljen  → pravi Postgres (Supabase, Neon…), migracije: `pnpm db:migrate`
 *  - DATABASE_URL nije postavljen → PGlite (Postgres u procesu) u mapi .data/, bez ikakve instalacije
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { promise?: Promise<Db> };
const holder = globalThis as unknown as { __rokovnikDb?: Holder };
holder.__rokovnikDb ??= {};

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function create(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    // Postavke za Supabase transakcijski pooler (port 6543) na serverlessu:
    //  - prepare:false: pooler dijeli veze, pa pripremljeni upiti ne vrijede;
    //  - max_pipeline:1: pooler zna zapeti kad više upita stigne istom vezom prije odgovora
    //    (usporedni upiti tada čekaju red ili idu drugom vezom);
    //  - query_timeout: ako baza ipak zašuti, upit pada s jasnom greškom umjesto da stranica visi.
    const client = postgres(url, {
      prepare: false,
      max: Number(process.env.DATABASE_POOL ?? 3),
      max_pipeline: 1,
      query_timeout: 12,
      connect_timeout: 10,
      idle_timeout: 20,
    });
    return drizzle(client, { schema }) as unknown as Db;
  }
  if (process.env.NETLIFY || process.env.VERCEL) {
    throw new Error("DATABASE_URL nije postavljen. Produkcija treba pravu Postgres bazu.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  let client;
  if (dir === "memory") {
    client = new PGlite();
  } else {
    const fs = await import("node:fs/promises");
    await fs.mkdir(path.dirname(dir), { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as Db;
}

export function getDb(): Promise<Db> {
  const h = holder.__rokovnikDb!;
  h.promise ??= create().catch((e) => {
    h.promise = undefined;
    throw e;
  });
  return h.promise;
}

/** Samo za testove: svježa baza u memoriji. */
export async function resetDbForTests(): Promise<Db> {
  process.env.PGLITE_DIR = "memory";
  delete process.env.DATABASE_URL;
  holder.__rokovnikDb = {};
  return getDb();
}

export { schema };
