/**
 * Je li dokazano da mail dolazi s domene iz polja From?
 *
 * Rezultate SPF/DKIM/DMARC računa poslužitelj koji prima mail (Resend), a ne pošiljatelj,
 * pa ih se ne može lažirati u samoj poruci. Samo DMARC "pass" dokazuje domenu iz polja From:
 * SPF sam provjerava tehničku adresu povrata, a DKIM sam potpis bilo koje domene, pa bez
 * DMARC-a napadač može proći oba s vlastitom domenom i tuđom adresom u polju From.
 *
 *   trusted     domena je dokazana: mail se smije objaviti automatski
 *   unverified  nema dokaza ni protudokaza: mail čeka ručnu odluku
 *   rejected    provjera izričito nije prošla: mail se odbija
 */
export type AuthResults = { spf?: string; dkim?: string; dmarc?: string } | null | undefined;
export type SenderVerdict = "trusted" | "unverified" | "rejected";

const norm = (s?: string) => (s ?? "").trim().toLowerCase();

export function senderVerdict(auth: AuthResults, mode: "strict" | "relaxed" = "strict"): SenderVerdict {
  if (!auth) return "unverified";
  const dmarc = norm(auth.dmarc);
  const spf = norm(auth.spf);
  const dkim = norm(auth.dkim);
  if (dmarc === "pass") return "trusted";
  if (dmarc === "fail") return "rejected";
  if (spf === "fail" && dkim === "fail") return "rejected";
  // Domena bez DMARC zapisa: samo ako je zajednica izričito prebačena na blaži način.
  if (mode === "relaxed" && spf === "pass" && dkim === "pass") return "trusted";
  return "unverified";
}
