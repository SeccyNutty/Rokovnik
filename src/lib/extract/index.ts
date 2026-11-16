import { extractWithRules } from "./heuristic";
import { extractWithLlm } from "./llm";
import type { Extractor } from "./types";

/** S postavljenim ANTHROPIC_API_KEY koristi se AI; inače jednostavna pravila (za razvoj i demo). */
export const extractItems: Extractor = (input) =>
  process.env.ANTHROPIC_API_KEY ? extractWithLlm(input) : extractWithRules(input);

export function extractorMode(): "ai" | "pravila" {
  return process.env.ANTHROPIC_API_KEY ? "ai" : "pravila";
}

export * from "./types";
