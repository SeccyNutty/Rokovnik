/**
 * Pojedinačne stavke spremljene u "Moj kalendar". Bez korisničkog računa: popis živi u
 * kolačiću na uređaju, pa ga poslužitelj može pročitati i složiti kalendar.
 */
export const SAVED_COOKIE = "rokovnik_spremljeno";
export const SAVED_MAX = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Čita popis iz vrijednosti kolačića ili parametra adrese; neispravno se odbacuje. */
export function parseSaved(value: string | null | undefined): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const id of decodeURIComponent(value).split(/[.,]/)) {
    const v = id.trim().toLowerCase();
    if (UUID.test(v) && !out.includes(v)) out.push(v);
  }
  return out.slice(-SAVED_MAX);
}

export function serializeSaved(ids: string[]): string {
  return ids.slice(-SAVED_MAX).join(".");
}
