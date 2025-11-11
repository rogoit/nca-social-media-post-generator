import { describe, it, expect, test } from 'vitest';
import { AIProviderManager } from '../../src/utils/ai-providers.js';
import { PromptFactory } from '../../src/utils/prompt-factory.js';
import { sampleTranscripts } from '../utils/fixtures.js';

// Skip all real tests if API keys are not available
const hasApiKeys = !!import.meta.env.GOOGLE_GEMINI_API_KEY || !!import.meta.env.ANTHROPIC_API_KEY;

describe.skipIf(!hasApiKeys)('Real Prompt Validation', () => {
  let manager: AIProviderManager;
  let promptFactory: PromptFactory;

  test.beforeAll(() => {
    manager = new AIProviderManager(
      import.meta.env.GOOGLE_GEMINI_API_KEY,
      import.meta.env.ANTHROPIC_API_KEY
    );
    promptFactory = new PromptFactory();
  });

  describe('YouTube prompts', () => {
    it('should generate valid YouTube content', async () => {
      const prompt = promptFactory.createYouTubePrompt(sampleTranscripts.medium);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(50);
      expect(result.model).toBeDefined();

      // Should contain key sections
      expect(result.text).toMatch(/TITLE:|DESCRIPTION:/i);
    }, 30000);

    it('should handle long transcripts', async () => {
      const prompt = promptFactory.createYouTubePrompt(sampleTranscripts.long);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);
    }, 30000);

    it('should generate appropriate hashtags', async () => {
      const prompt = promptFactory.createYouTubePrompt(sampleTranscripts.medium);
      const result = await manager.generateContent(prompt);

      // Should have hashtags
      expect(result.text).toMatch(/#\w+/);
    }, 30000);
  });

  describe('LinkedIn prompts', () => {
    it('should generate professional LinkedIn content', async () => {
      const prompt = promptFactory.createLinkedInPrompt(sampleTranscripts.medium);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);
      expect(result.text.length).toBeLessThanOrEqual(3000);

      // Should have professional structure
      expect(result.text).toMatch(/#\w+/); // Hashtags
      // Should mention relevant topics
      expect(result.text.toLowerCase()).toMatch(/digital|innovation|technology|business|cloud/);
      // Professional tone - should have proper punctuation
      expect(result.text).toMatch(/[.!?]/);
    }, 30000);

    it('should maintain professional tone', async () => {
      const prompt = promptFactory.createLinkedInPrompt(sampleTranscripts.medium);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);

      // Should be structured professionally (paragraphs, not one long line)
      const lines = result.text.split('\n').filter(l => l.trim().length > 0);
      expect(lines.length).toBeGreaterThan(2);

      // Should contain professional keywords from transcript
      expect(result.text.toLowerCase()).toMatch(/transformation|business|enterprise|innovation|technology/);
    }, 30000);
  });

  describe('Instagram prompts', () => {
    it('should generate engaging Instagram content', async () => {
      const prompt = promptFactory.createInstagramPrompt(sampleTranscripts.medium);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(100);
      expect(result.text.length).toBeLessThanOrEqual(2200);

      // Instagram typically uses multiple hashtags
      const hashtagCount = (result.text.match(/#\w+/g) || []).length;
      expect(hashtagCount).toBeGreaterThan(3);
      expect(hashtagCount).toBeLessThan(20);

      // Should be engaging and mention relevant topics
      expect(result.text.toLowerCase()).toMatch(/digital|innovation|technology|cloud/);

      // Instagram content should be concise but engaging
      const sentences = result.text.split(/[.!?]+/).filter(s => s.trim().length > 10);
      expect(sentences.length).toBeGreaterThan(2);
    }, 30000);
  });

  describe('Twitter/X prompts', () => {
    it('should generate concise Twitter content', async () => {
      const prompt = promptFactory.createTwitterPrompt(sampleTranscripts.medium);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(50);
      expect(result.text.length).toBeLessThanOrEqual(280);

      // Should have hashtags for discoverability
      expect(result.text).toMatch(/#\w+/);

      // Should capture key topic from transcript
      expect(result.text.toLowerCase()).toMatch(/digital|innovation|technology|cloud|transformation/);

      // Should be punchy and complete despite length constraint
      expect(result.text).toMatch(/[.!]/);
    }, 30000);
  });

  describe('Keywords extraction', () => {
    it('should extract relevant keywords', async () => {
      const prompt = promptFactory.createKeywordsPrompt(sampleTranscripts.medium);
      const result = await manager.generateContent(prompt);

      expect(result.text).toBeDefined();

      // Should contain multiple keywords
      const keywords = result.text.split(/\n|,/).filter(k => k.trim().length > 0);
      expect(keywords.length).toBeGreaterThan(5);
      expect(keywords.length).toBeLessThan(30);

      // Keywords should be relevant to transcript content
      const allKeywords = keywords.join(' ').toLowerCase();
      expect(allKeywords).toMatch(/digital|innovation|technology|transformation|cloud|business|enterprise/);

      // Each keyword should be reasonably short (not sentences)
      keywords.forEach(keyword => {
        expect(keyword.trim().split(/\s+/).length).toBeLessThan(5);
      });
    }, 30000);
  });
});
