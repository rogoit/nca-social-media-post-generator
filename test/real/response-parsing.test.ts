import { describe, it, expect, test } from 'vitest';
import { AIProviderManager } from '../../src/utils/ai-providers.js';
import { ResponseParser } from '../../src/utils/response-parser.js';
import { PromptFactory } from '../../src/utils/prompt-factory.js';
import { sampleTranscripts } from '../utils/fixtures.js';

const hasApiKeys = !!import.meta.env.GOOGLE_GEMINI_API_KEY || !!import.meta.env.ANTHROPIC_API_KEY;

describe.skipIf(!hasApiKeys)('Real Response Parsing', () => {
  let manager: AIProviderManager;
  let parser: ResponseParser;
  let promptFactory: PromptFactory;

  test.beforeAll(() => {
    manager = new AIProviderManager(
      import.meta.env.GOOGLE_GEMINI_API_KEY,
      import.meta.env.ANTHROPIC_API_KEY
    );
    parser = new ResponseParser();
    promptFactory = new PromptFactory();
  });

  describe('YouTube response parsing', () => {
    it('should parse real YouTube response correctly', async () => {
      const prompt = promptFactory.createYouTubePrompt(sampleTranscripts.medium);
      const result = await manager.generateContent(prompt);

      const parsed = parser.parseYouTubeResponse(result.text);

      expect(parsed).toBeDefined();
      expect(parsed.title).toBeDefined();
      expect(parsed.description).toBeDefined();
      expect(parsed.title.length).toBeGreaterThan(0);
      expect(parsed.description.length).toBeGreaterThan(0);
    }, 30000);

    it('should handle transcript section if present', async () => {
      const prompt = promptFactory.createYouTubePrompt(sampleTranscripts.medium);
      const result = await manager.generateContent(prompt);

      const parsed = parser.parseYouTubeResponse(result.text);

      // Transcript section may or may not be present
      if (parsed.transcript) {
        expect(parsed.transcript.length).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('Keywords response parsing', () => {
    it('should parse real keywords response into array', async () => {
      const prompt = promptFactory.createKeywordsPrompt(sampleTranscripts.medium);
      const result = await manager.generateContent(prompt);

      const keywords = parser.parseKeywordsResponse(result.text);

      expect(Array.isArray(keywords)).toBe(true);
      expect(keywords.length).toBeGreaterThan(0);
      keywords.forEach(keyword => {
        expect(typeof keyword).toBe('string');
        expect(keyword.trim().length).toBeGreaterThan(0);
      });
    }, 30000);
  });

  describe('LinkedIn response parsing', () => {
    it('should parse real LinkedIn response', async () => {
      const prompt = promptFactory.createLinkedInPrompt(sampleTranscripts.medium);
      const result = await manager.generateContent(prompt);

      const parsed = parser.parseLinkedInResponse(result.text);

      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe('string');
      expect(parsed.length).toBeGreaterThan(50);
      expect(parsed.length).toBeLessThanOrEqual(3000);
    }, 30000);
  });

  describe('Instagram response parsing', () => {
    it('should parse real Instagram response', async () => {
      const prompt = promptFactory.createInstagramPrompt(sampleTranscripts.medium);
      const result = await manager.generateContent(prompt);

      const parsed = parser.parseInstagramResponse(result.text);

      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe('string');
      expect(parsed.length).toBeLessThanOrEqual(2200);
    }, 30000);
  });

  describe('Edge cases with real responses', () => {
    it('should handle responses with special characters', async () => {
      const prompt = promptFactory.createYouTubePrompt(sampleTranscripts.edgeCase);
      const result = await manager.generateContent(prompt);

      const parsed = parser.parseYouTubeResponse(result.text);

      expect(parsed.title).toBeDefined();
      expect(parsed.description).toBeDefined();
    }, 30000);

    it('should handle very short transcripts', async () => {
      const prompt = promptFactory.createYouTubePrompt(sampleTranscripts.short);
      const result = await manager.generateContent(prompt);

      const parsed = parser.parseYouTubeResponse(result.text);

      expect(parsed.title).toBeDefined();
      expect(parsed.description).toBeDefined();
    }, 30000);
  });
});
