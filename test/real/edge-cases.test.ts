import { describe, it, expect, test } from "vitest";
import { AIProviderManager } from "../../src/utils/ai-providers.js";
import { PromptFactory } from "../../src/utils/prompt-factory.js";
import { ResponseParser } from "../../src/utils/response-parser.js";

const hasApiKeys =
  !!import.meta.env.GOOGLE_GEMINI_API_KEY ||
  !!import.meta.env.ANTHROPIC_API_KEY;

describe.skipIf(!hasApiKeys)("Edge Cases with Real AI", () => {
  let manager: AIProviderManager;
  let promptFactory: PromptFactory;
  let parser: ResponseParser;

  test.beforeAll(() => {
    manager = new AIProviderManager(
      import.meta.env.GOOGLE_GEMINI_API_KEY,
      import.meta.env.ANTHROPIC_API_KEY
    );
    promptFactory = new PromptFactory();
    parser = new ResponseParser();
  });

  describe("Special characters and encoding", () => {
    it("should handle emojis in transcript", async () => {
      const transcript =
        "This is about web development 🚀 and innovation 💡 in tech 🖥️";
      const prompt = promptFactory.createYouTubePrompt(transcript);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);

      // Parse should succeed despite emojis
      const parsed = parser.parseYouTubeResponse(result.text);
      expect(parsed.title).toBeDefined();
      expect(parsed.title.length).toBeGreaterThan(10);
      expect(parsed.description).toBeDefined();
      expect(parsed.description.length).toBeGreaterThan(50);
    }, 30000);

    it("should handle quotes and special punctuation", async () => {
      const transcript =
        'He said: "Innovation is key." But what does that mean? Let\'s explore!';
      const prompt = promptFactory.createYouTubePrompt(transcript);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);

      const parsed = parser.parseYouTubeResponse(result.text);
      expect(parsed.title).toBeDefined();
      expect(parsed.description).toBeDefined();
      // Should contain professional content about innovation
      expect(parsed.description.toLowerCase()).toMatch(
        /innovation|development|explore/
      );
    }, 30000);

    it("should handle non-English characters", async () => {
      const transcript =
        "Über die Entwicklung von JavaScript und TypeScript für große Anwendungen";
      const prompt = promptFactory.createYouTubePrompt(transcript);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);

      const parsed = parser.parseYouTubeResponse(result.text);
      expect(parsed.title).toBeDefined();
      expect(parsed.title.length).toBeGreaterThan(10);
      expect(parsed.description).toBeDefined();
      // Should mention JavaScript or TypeScript
      expect(parsed.description.toLowerCase()).toMatch(/javascript|typescript/);
    }, 30000);

    it("should handle mixed language content", async () => {
      const transcript =
        "Today we discuss JavaScript development with a focus on performance optimization";
      const prompt = promptFactory.createYouTubePrompt(transcript);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);

      const parsed = parser.parseYouTubeResponse(result.text);
      expect(parsed.title).toBeDefined();
      expect(parsed.description).toBeDefined();
      // Should be about JavaScript performance
      expect(parsed.description.toLowerCase()).toMatch(
        /javascript|performance|optimization|development/
      );
    }, 30000);
  });

  describe("Length edge cases", () => {
    it("should handle very short transcripts", async () => {
      const transcript = "JavaScript development tips";
      const prompt = promptFactory.createYouTubePrompt(transcript);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);

      const parsed = parser.parseYouTubeResponse(result.text);
      // Even with short input, should generate meaningful content
      expect(parsed.title).toBeDefined();
      expect(parsed.title.length).toBeGreaterThan(10);
      expect(parsed.title.length).toBeLessThan(150);
      expect(parsed.description).toBeDefined();
      expect(parsed.description.length).toBeGreaterThan(50);
      // Should mention JavaScript
      expect(parsed.description.toLowerCase()).toContain("javascript");
    }, 30000);

    it("should handle transcript at character limit", async () => {
      // Create a very long transcript
      const baseText =
        "This is a detailed discussion about software development, web technologies, cloud computing, and modern programming practices. ";
      const transcript = baseText.repeat(100); // Create long text

      const prompt = promptFactory.createYouTubePrompt(transcript);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);

      const parsed = parser.parseYouTubeResponse(result.text);
      expect(parsed.title).toBeDefined();
      expect(parsed.description).toBeDefined();
      // Should still generate concise, useful content even from long input
      expect(parsed.title.length).toBeLessThan(150);
      expect(parsed.description.length).toBeGreaterThan(100);
      expect(parsed.description.toLowerCase()).toMatch(
        /development|technology|programming/
      );
    }, 60000);
  });

  describe("Content variations", () => {
    it("should handle technical jargon heavy content", async () => {
      const transcript =
        "Today we discuss TypeScript generics, dependency injection, abstract factory patterns, and SOLID principles in object-oriented programming";
      const prompt = promptFactory.createYouTubePrompt(transcript);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);

      const parsed = parser.parseYouTubeResponse(result.text);
      expect(parsed.title).toBeDefined();
      expect(parsed.title.length).toBeGreaterThan(10);
      expect(parsed.description).toBeDefined();
      // Should preserve technical concepts
      expect(parsed.description.toLowerCase()).toMatch(
        /typescript|pattern|solid|programming/
      );
    }, 30000);

    it("should handle conversational casual content", async () => {
      const transcript =
        "Hey everyone! Today we're gonna talk about coding and stuff. It's gonna be fun!";
      const prompt = promptFactory.createYouTubePrompt(transcript);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);

      const parsed = parser.parseYouTubeResponse(result.text);
      expect(parsed.title).toBeDefined();
      expect(parsed.description).toBeDefined();
      expect(parsed.description.length).toBeGreaterThan(50);
      // Should generate professional content even from casual input
      expect(parsed.description.toLowerCase()).toContain("coding");
    }, 30000);

    it("should handle content with numbers and data", async () => {
      const transcript =
        "In 2024, we saw a 45% increase in JavaScript usage, with over 12.5 million developers using React and 8.3 million using Vue.js";
      const prompt = promptFactory.createYouTubePrompt(transcript);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);

      const parsed = parser.parseYouTubeResponse(result.text);
      expect(parsed.title).toBeDefined();
      expect(parsed.description).toBeDefined();
      // Should mention the frameworks or statistics
      expect(parsed.description.toLowerCase()).toMatch(/javascript|react|vue/);
      // Title should be professional despite data-heavy input
      expect(parsed.title.length).toBeLessThan(150);
    }, 30000);

    it("should handle content with URLs and links", async () => {
      const transcript =
        "Check out https://github.com for code and https://stackoverflow.com for help with JavaScript development";
      const prompt = promptFactory.createYouTubePrompt(transcript);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);

      const parsed = parser.parseYouTubeResponse(result.text);
      expect(parsed.title).toBeDefined();
      expect(parsed.title.length).toBeGreaterThan(10);
      expect(parsed.description).toBeDefined();
      // Should generate content about resources/development
      expect(parsed.description.toLowerCase()).toMatch(
        /javascript|development|code|github|stackoverflow|resource/
      );
      // URLs should not break parsing
      expect(parsed.title).not.toContain("http");
      expect(parsed.description.length).toBeGreaterThan(50);
    }, 30000);
  });

  describe("Platform-specific edge cases", () => {
    it("should handle Twitter length constraints with long transcript", async () => {
      const transcript =
        "This is a very long discussion about web development, covering topics like React, Vue, Angular, TypeScript, JavaScript ES2024, webpack, vite, and many more technologies that are important for modern web development";
      const prompt = promptFactory.createTwitterPrompt(transcript);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeLessThanOrEqual(280);
      expect(result.text.length).toBeGreaterThan(50);
      // Should be concise but meaningful
      expect(result.text.toLowerCase()).toMatch(
        /web|development|javascript|react|vue|angular|typescript/
      );
      // Should have hashtags for Twitter
      expect(result.text).toMatch(/#\w+/);
    }, 30000);

    it("should handle Instagram with emoji-heavy content", async () => {
      const transcript =
        "Web development is amazing with modern tools and frameworks";
      const prompt = promptFactory.createInstagramPrompt(transcript);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeLessThanOrEqual(2200);
      expect(result.text.length).toBeGreaterThan(100);
      // Instagram content should be engaging
      expect(result.text.toLowerCase()).toMatch(
        /web|development|tools|frameworks/
      );
      // Should have hashtags
      expect(result.text).toMatch(/#\w+/);
      // Count hashtags - Instagram typically has multiple
      const hashtagCount = (result.text.match(/#\w+/g) || []).length;
      expect(hashtagCount).toBeGreaterThan(2);
      expect(hashtagCount).toBeLessThan(15);
    }, 30000);
  });

  describe("Error recovery", () => {
    it("should handle malformed but parseable content", async () => {
      const transcript =
        "no punctuation just words about javascript development and web technologies";
      const prompt = promptFactory.createYouTubePrompt(transcript);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);

      // Should still parse successfully
      const parsed = parser.parseYouTubeResponse(result.text);
      expect(parsed).toBeDefined();
      expect(parsed.title).toBeDefined();
      expect(parsed.title.length).toBeGreaterThan(10);
      expect(parsed.description).toBeDefined();
      expect(parsed.description.length).toBeGreaterThan(50);
      // Should add proper punctuation and structure
      expect(parsed.description).toMatch(/[.!?]/);
      expect(parsed.description.toLowerCase()).toMatch(
        /javascript|development|web/
      );
    }, 30000);

    it("should handle transcript with excessive whitespace", async () => {
      const transcript =
        "   JavaScript     development   with    lots     of     spaces   ";
      const prompt = promptFactory.createYouTubePrompt(transcript);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);

      const parsed = parser.parseYouTubeResponse(result.text);
      expect(parsed.title).toBeDefined();
      expect(parsed.description).toBeDefined();
      // Should generate clean content despite messy input
      expect(parsed.title).not.toMatch(/\s{2,}/); // No double spaces
      expect(parsed.description.toLowerCase()).toContain("javascript");
      expect(parsed.description.length).toBeGreaterThan(50);
    }, 30000);
  });
});
