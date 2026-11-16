import { z } from "zod";

export const CATEGORIES = [
  "lecture",
  "workshop",
  "hackathon",
  "competition",
  "fair",
  "scholarship",
  "call",
  "social",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  lecture: "predavanje",
  workshop: "radionica",
  hackathon: "hackathon",
  competition: "natjecanje",
  fair: "smotra ili sajam",
  scholarship: "stipendija",
  call: "natječaj",
  social: "druženje",
  other: "ostalo",
};

const nullable = z.string().trim().nullish().transform((v) => (v ? v : null));

/** Jedna stavka onako kako je vraća izvlačenje (AI ili pravila). Datumi su lokalni, Europe/Zagreb. */
export const ExtractedItemSchema = z.object({
  kind: z.enum(["event", "deadline"]),
  title: z.string().trim().min(3).max(140),
  summary: z.string().trim().max(400).default(""),
  description: z.string().trim().max(4000).default(""),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullish().transform((v) => v ?? null),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform((v) => v ?? null),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullish().transform((v) => v ?? null),
  location: nullable,
  online_url: nullable,
  registration_url: nullable,
  organizer: nullable,
  category: z.enum(CATEGORIES).catch("other"),
  confidence: z.number().min(0).max(1).catch(0.5),
});

export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

export const ExtractionSchema = z.object({ items: z.array(z.unknown()).max(20) });

export type ExtractionInput = {
  subject: string;
  text: string;
  /** Trenutak primitka maila; prema njemu se računaju "sutra", "sljedeći utorak"… */
  receivedAt: Date;
  attachments?: { filename: string; contentType: string; dataBase64: string }[];
};

export type ExtractionResult = { items: ExtractedItem[]; extractor: "ai" | "pravila" };

export type Extractor = (input: ExtractionInput) => Promise<ExtractionResult>;

/** Pojedinačno provjerava stavke: jedna neispravna ne ruši ostale. */
export function parseExtractedItems(raw: unknown): ExtractedItem[] {
  const top = ExtractionSchema.safeParse(raw);
  if (!top.success) return [];
  const out: ExtractedItem[] = [];
  for (const candidate of top.data.items) {
    const parsed = ExtractedItemSchema.safeParse(candidate);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
