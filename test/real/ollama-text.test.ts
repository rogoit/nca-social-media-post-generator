import { describe, it, expect } from "vitest";
import { OllamaProvider } from "../../src/utils/ai-providers.js";
import { TRANSCRIPT_RESPONSE_FORMAT } from "../../src/config/schemas.js";

/**
 * Real-API smoke test against the configured Ollama endpoint. Uses a
 * realistically-sized turn-1 prompt (brand rules + a paragraph transcript) so
 * it exercises real latency — a trivially short prompt hid the timeout failure
 * that a large model like qwen3.5:397b hits in production. Verifies that the
 * default model (1) honors the strict json_schema response_format the pipeline
 * relies on and (2) returns within a sane bound of the request timeout.
 * Skips automatically when OLLAMA_API_KEY is missing.
 *
 * Run: npm run test:real   (costs Ollama API credit)
 */
const OLLAMA_API_KEY = import.meta.env.OLLAMA_API_KEY;

// A prompt comparable in size to a real turn 1 (brand rules + paragraph).
const REALISTIC_PROMPT = [
  "Du bist ein deutscher Social-Media-Editor. Korrigiere das folgende Transkript:",
  "Satzanfänge groß, Markennamen korrekt (Never Code Alone, AI Nights, OpenCode,",
  "PHPStan, Claude, PHP, Vitest). Keine Bindestriche. Erfinde keine Zahlen, Daten,",
  "Zitate. Gib JSON zurück mit transcript (String) und keywords (max 3 Strings).",
  "",
  "Transkript: heute sprechen wir ueber php und wie man mit php stan die code",
  "qualitaet verbessert, ausserdem geht es um vitest fuer unit tests und wie claude",
  "als coding assistent helfen kann, wir erwaehnen auch die ai nights und never",
  "code alone community in duisburg, open code ist auch ein thema, dazu ein paar",
  "worte ueber moderne entwicklung mit type script und react, astro als framework,",
  "tailwind fuer css, und vieles mehr rund um das thema software engineering und",
  "backend entwicklung mit node js, docker fuer deployment, gitlab ci fuer",
  "pipelines, und generell wie man gute software baut die skaliert und wartbar",
  "bleibt ueber jahre hinweg.",
  "",
  "Gib NUR ein JSON-Objekt zurueck mit den Schluesseln transcript und keywords.",
].join("\n");

describe.skipIf(!OLLAMA_API_KEY)("Ollama text generation (real)", () => {
  it("returns strict-json_schema-adherent output for a realistic turn-1 prompt", async () => {
    const provider = new OllamaProvider(OLLAMA_API_KEY!);
    provider.startChatSession();

    const start = Date.now();
    const { text, model } = await provider.sendChatMessage!(
      REALISTIC_PROMPT,
      TRANSCRIPT_RESPONSE_FORMAT
    );
    const elapsed = Date.now() - start;

    // The content must be parseable as the expected schema shape — if the model
    // leaks reasoning blocks into content, JSON.parse throws here.
    const parsed = JSON.parse(text) as { transcript?: string; keywords?: string[] };
    expect(typeof parsed.transcript).toBe("string");
    expect(parsed.transcript!.length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.keywords)).toBe(true);
    expect((parsed.keywords ?? []).length).toBeLessThanOrEqual(3);

    // Defensive: flag thinking pollution explicitly so the failure message is
    // actionable rather than a cryptic JSON.parse error.
    expect(text).not.toMatch(/<think>/i);

    // Must complete well within the request timeout — a realistic prompt that
    // approaches the timeout is the regression signal this test exists to catch.
    expect(elapsed).toBeLessThan(15000);
    expect(model).toBe(`Ollama/${import.meta.env.OLLAMA_MODEL || "gpt-oss:20b"}`);
  }, 45000);
});
