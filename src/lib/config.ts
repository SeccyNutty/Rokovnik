/** Ime sustava mijenja se na jednom mjestu (ili varijablom NEXT_PUBLIC_APP_NAME). */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Rokovnik";
export const APP_TAGLINE = "Događaji i rokovi tvojih zajednica na jednom mjestu";
export const TZ = "Europe/Zagreb";

export const isProd = process.env.NODE_ENV === "production";

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Tajna za potpisivanje kolačića i poveznica za potvrdu. */
export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (s && s.length >= 32) return s;
  if (isProd) throw new Error("APP_SECRET nije postavljen ili je prekratak (najmanje 32 znaka).");
  return "rokovnik-dev-secret-not-for-production";
}

/** Lozinka administratora. U razvoju je zadana "rokovnik", u produkciji mora biti postavljena. */
export function adminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD;
  if (p) return p;
  return isProd ? null : "rokovnik";
}

/** Google računi koji su administratori (ADMIN_EMAILS, uz ADMIN_EMAIL). */
export function adminEmails(): string[] {
  const all = new Set(list(process.env.ADMIN_EMAILS));
  const one = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (one) all.add(one);
  return [...all];
}

/** Kamo se šalju zahtjevi za nove zajednice. */
export function adminEmail(): string | null {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
}

/**
 * Adrese kojima vjerujemo kad prosljeđuju tuđe mailove: za njih se zajednica
 * određuje prema izvornom pošiljatelju iz proslijeđene poruke.
 */
export function forwarderEmails(): string[] {
  const all = new Set(list(process.env.FORWARDER_EMAILS));
  const admin = adminEmail();
  if (admin) all.add(admin);
  return [...all];
}

/** Adresa na koju organizacije šalju mailove (prikazuje se na stranici "Objavi događaj"). */
export function inboundAddress(): string | null {
  return process.env.INBOUND_ADDRESS?.trim() || null;
}

/** Javna adresa aplikacije, bez kose crte na kraju. */
export function configuredBaseUrl(): string | null {
  const u = process.env.APP_URL || process.env.URL || process.env.DEPLOY_PRIME_URL;
  return u ? u.replace(/\/+$/, "") : null;
}
