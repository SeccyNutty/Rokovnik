/**
 * Predmemorija javnih upita. Kalendar se čita puno češće nego što se mijenja, pa se rezultati
 * upita pamte i odmah poništavaju kad se nešto objavi, sakrije ili promijeni. Time većina
 * otvaranja stranice ne ide do baze (koja može biti na drugom kontinentu od poslužitelja).
 *
 * Izvan Next.js-a (testovi, skripte) predmemorije nema: funkcije se zovu izravno.
 */
const TAG = "rokovnik-podaci";

/** Sigurnosna mreža: i bez poništavanja podaci nisu stariji od ovoga (sekunde). */
const MAX_AGE = 120;

/**
 * Prostor ključeva vezan je uz bazu: predmemorija preživljava nove objave aplikacije, pa se
 * podaci jedne baze nikad ne smiju pokazati nakon prelaska na drugu (npr. lokalna → Supabase).
 */
function namespace(): string {
  if (process.env.ROKOVNIK_CACHE_NS) return process.env.ROKOVNIK_CACHE_NS;
  const source = process.env.DATABASE_URL || process.env.PGLITE_DIR || "lokalno";
  let h = 5381;
  for (let i = 0; i < source.length; i++) h = ((h << 5) + h + source.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const inNext = Boolean(process.env.NEXT_RUNTIME) && process.env.ROKOVNIK_CACHE !== "0";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Predmemorija sprema JSON, pa datume (polja ...At) treba vratiti iz teksta u Date. */
export function reviveDates<T>(value: T): T {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = reviveDates(value[i]);
    return value;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const o = value as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === "string") {
        if (k.endsWith("At") && ISO.test(v)) o[k] = new Date(v);
      } else if (v && typeof v === "object") {
        o[k] = reviveDates(v);
      }
    }
  }
  return value;
}

/**
 * Omata upit predmemorijom. Argumenti moraju biti jednostavne vrijednosti (tekst, broj, polja,
 * obični objekti): oni su ključ. Datume zato prosljeđuj kao ISO tekst.
 */
export function cachedQuery<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  if (!inNext) return fn;
  let wrapped: ((...args: A) => Promise<R>) | undefined;
  return async (...args: A) => {
    if (!wrapped) {
      const { unstable_cache } = await import("next/cache");
      wrapped = unstable_cache(fn, ["rokovnik", namespace(), name], { tags: [TAG], revalidate: MAX_AGE });
    }
    try {
      return reviveDates(await wrapped(...args));
    } catch (e) {
      // Greška same predmemorije ne smije srušiti stranicu; greška upita će se ponoviti i ovdje.
      if (e instanceof Error && /incrementalCache|unstable_cache/i.test(e.message)) return fn(...args);
      throw e;
    }
  };
}

/** Poziva se nakon svake izmjene podataka: sljedeće čitanje ide ravno u bazu. */
export async function touchData(): Promise<void> {
  if (!inNext) return;
  try {
    const { revalidateTag } = await import("next/cache");
    revalidateTag(TAG, { expire: 0 });
  } catch {
    // Izvan zahtjeva (npr. skripta) nema što poništiti; MAX_AGE ograničava starost.
  }
}
