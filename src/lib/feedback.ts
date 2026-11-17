import type { Community, Item, Message } from "@/db/schema";
import { APP_NAME } from "./config";
import { allow } from "./ratelimit";
import { canSendEmail, sendEmail } from "./resend";
import { formatWhen } from "./time";

export type FeedbackInput = {
  message: Message;
  community: Community | null;
  status: Message["status"];
  items: Item[];
  baseUrl: string | null;
};

/** Tekst povratne poruke; odvojeno od slanja radi testiranja. Vraća null kad nema što javiti. */
export function buildFeedback(input: FeedbackInput): { subject: string; text: string } | null {
  const { message, community, status, items, baseUrl } = input;
  const about = message.subject ? `„${message.subject}”` : "tvoj mail";
  const link = community && baseUrl ? `${baseUrl}/z/${community.slug}` : null;
  const foot = `\n\nOvo je automatska poruka sustava ${APP_NAME}. Ako nisi ti poslao taj mail, slobodno je zanemari.`;

  if (status === "published" && community && items.length) {
    const list = items.map((i) => `  • ${i.kind === "deadline" ? "ROK: " : ""}${i.title} (${formatWhen(i)})`).join("\n");
    return {
      subject: `Objavljeno u zajednici ${community.name}: ${message.subject || "tvoja objava"}`,
      text:
        `Mail ${about} je obrađen i objavljen u zajednici ${community.name}.\n\n` +
        `Objavljeno:\n${list}\n\n` +
        (link ? `Pogledaj kako izgleda: ${link}\n\n` : "") +
        `Nešto nije točno? Pošalji ispravljeni mail s istim naslovom i datumom: postojeća objava će se ažurirati, bez duplikata.` +
        foot,
    };
  }
  if (status === "no_items") {
    return {
      subject: `Nije objavljeno: ${message.subject || "tvoj mail"}`,
      text:
        `U mailu ${about} nismo pronašli datum događaja ni rok prijave, pa ništa nije objavljeno.\n\n` +
        `Da bi objava uspjela, u tekstu navedi što se događa, datum (npr. 15. 12. 2026.), vrijeme i mjesto, te rok prijave ako postoji.` +
        (link ? `\n\nZajednica: ${link}` : "") +
        foot,
    };
  }
  if (status === "pending_community") {
    return {
      subject: `Zaprimljeno: ${message.subject || "tvoj mail"}`,
      text:
        `Mail ${about} je zaprimljen. Tvoja organizacija još nema zajednicu u sustavu ${APP_NAME}, pa objava čeka potvrdu administratora.\n\n` +
        `Nakon potvrde ovaj i svi budući mailovi s tvoje domene objavljuju se automatski, i o tome ćeš dobiti poruku.` +
        foot,
    };
  }
  return null;
}

/**
 * Javlja pošiljatelju ishod objave. Šalje se samo za prave mailove dokazanog pošiljatelja
 * (inače bismo odgovarali na lažirane adrese), nikad na automatske ili masovne mailove
 * (petlje s automatskim odgovorima) i najviše 20 poruka dnevno po adresi.
 */
export async function sendPublisherFeedback(input: FeedbackInput): Promise<void> {
  const { message } = input;
  if (process.env.FEEDBACK_EMAILS === "off" || !canSendEmail()) return;
  if (message.provider === "test" || !message.verified || message.automated) return;
  if (/^(no-?reply|noreply|do-?not-?reply|mailer-daemon|postmaster|bounce)/i.test(message.fromAddress)) return;
  const mail = buildFeedback(input);
  if (!mail) return;
  if (!(await allow(`povratna:${message.fromAddress}`, 20, 24 * 3600))) return;
  await sendEmail({ to: message.fromAddress, ...mail, headers: { "Auto-Submitted": "auto-replied", "X-Auto-Response-Suppress": "All" } });
}
