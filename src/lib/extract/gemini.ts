import { buildMailText, SYSTEM, usableAttachments } from "./llm";
import { parseExtractedItems, type ExtractionInput, type ExtractionResult } from "./types";

/** Izvlačenje događaja i rokova pomoću Gemini API-ja (JSON izlaz, provjeren zodom). */

const FORMAT = `

Odgovori ISKLJUČIVO jednim JSON objektom ovog oblika, bez dodatnog teksta:
{"items":[{"kind":"event"|"deadline","title":"…","summary":"…","description":"…","start_date":"YYYY-MM-DD","start_time":"HH:MM"|null,"end_date":"YYYY-MM-DD"|null,"end_time":"HH:MM"|null,"location":string|null,"online_url":string|null,"registration_url":string|null,"organizer":string|null,"category":"lecture"|"workshop"|"hackathon"|"competition"|"fair"|"scholarship"|"call"|"social"|"other","confidence":0.0-1.0}]}
Ako u mailu nema stavki, vrati {"items":[]}.`;

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

/** Model ponekad omota JSON u ```json ograde ili vrati golu listu; oboje prihvaćamo. */
export function parseGeminiJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const raw: unknown = JSON.parse(cleaned);
  return Array.isArray(raw) ? { items: raw } : raw;
}

export async function extractWithGemini(input: ExtractionInput): Promise<ExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY nije postavljen.");
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const attachments = usableAttachments(input);
  const parts: Part[] = attachments.map((a) => ({ inlineData: { mimeType: a.contentType, data: a.dataBase64 } }));
  parts.push({ text: buildMailText(input, attachments.length > 0) });

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM + FORMAT }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 8192 },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text.trim()) throw new Error("Gemini API nije vratio odgovor.");
  return { items: parseExtractedItems(parseGeminiJson(text)), extractor: "ai" };
}
