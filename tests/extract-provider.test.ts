import { afterEach, describe, expect, it } from "vitest";
import { parseGeminiJson } from "@/lib/extract/gemini";
import { llmProvider } from "@/lib/extract/provider";
import { parseExtractedItems } from "@/lib/extract/types";

const KEYS = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "LLM_PROVIDER"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
function setEnv(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
}

describe("odabir AI pružatelja", () => {
  it("bez ključeva koristi pravila", () => {
    setEnv({});
    expect(llmProvider()).toBeNull();
  });
  it("sam ključ određuje pružatelja", () => {
    setEnv({ GEMINI_API_KEY: "g" });
    expect(llmProvider()).toBe("gemini");
    setEnv({ ANTHROPIC_API_KEY: "a" });
    expect(llmProvider()).toBe("anthropic");
  });
  it("uz oba ključa prednost ima Anthropic, a LLM_PROVIDER to mijenja", () => {
    setEnv({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" });
    expect(llmProvider()).toBe("anthropic");
    setEnv({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g", LLM_PROVIDER: "Gemini" });
    expect(llmProvider()).toBe("gemini");
  });
  it("odabran pružatelj bez svog ključa znači pravila, ne tiho drugi pružatelj", () => {
    setEnv({ ANTHROPIC_API_KEY: "a", LLM_PROVIDER: "gemini" });
    expect(llmProvider()).toBeNull();
  });
});

describe("Gemini JSON odgovor", () => {
  const item = { kind: "event", title: "Predavanje o robotici", start_date: "2026-12-03", category: "lecture", confidence: 0.9 };
  it("čita običan JSON", () => {
    expect(parseExtractedItems(parseGeminiJson(JSON.stringify({ items: [item] })))).toHaveLength(1);
  });
  it("čita JSON u ```json ogradama", () => {
    expect(parseExtractedItems(parseGeminiJson("```json\n" + JSON.stringify({ items: [item] }) + "\n```"))).toHaveLength(1);
  });
  it("prihvaća golu listu", () => {
    expect(parseExtractedItems(parseGeminiJson(JSON.stringify([item])))).toHaveLength(1);
  });
  it("prazan odgovor daje nula stavki", () => {
    expect(parseExtractedItems(parseGeminiJson('{"items":[]}'))).toEqual([]);
  });
});
