/** Koji AI pružatelj čita mailove. Bez ključa ostaju jednostavna pravila. */
export type Provider = "anthropic" | "gemini";

export function llmProvider(): Provider | null {
  const want = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (want === "gemini") return process.env.GEMINI_API_KEY ? "gemini" : null;
  if (want === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

export const PROVIDER_LABEL: Record<Provider, string> = { anthropic: "Claude", gemini: "Gemini" };
