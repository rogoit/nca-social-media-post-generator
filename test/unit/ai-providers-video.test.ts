import { describe, it, expect } from "vitest";
import { GoogleGeminiProvider } from "../../src/utils/ai-providers.js";

// We test the interface — the actual Gemini call is mocked in functional tests
describe("GoogleGeminiProvider.extractTranscript", () => {
  it("should have an extractTranscript method", () => {
    // Can't construct without valid key, but we can check the prototype
    expect(typeof GoogleGeminiProvider.prototype.extractTranscript).toBe("function");
  });
});
