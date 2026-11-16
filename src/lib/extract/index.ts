import { extractWithGemini } from "./gemini";
import { extractWithRules } from "./heuristic";
import { extractWithLlm } from "./llm";
import { llmProvider } from "./provider";
import type { Extractor } from "./types";

/**
 * S postavljenim ključem (ANTHROPIC_API_KEY ili GEMINI_API_KEY) koristi se AI; inače jednostavna
 * pravila (za razvoj i demo). LLM_PROVIDER=anthropic|gemini bira pružatelja kad su postavljena oba.
 */
export const extractItems: Extractor = (input) => {
  const provider = llmProvider();
  if (provider === "gemini") return extractWithGemini(input);
  if (provider === "anthropic") return extractWithLlm(input);
  return extractWithRules(input);
};

export function extractorMode(): "ai" | "pravila" {
  return llmProvider() ? "ai" : "pravila";
}

export { llmProvider, PROVIDER_LABEL } from "./provider";
export * from "./types";
