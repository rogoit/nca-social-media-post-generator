import { describe, it, expect, test } from 'vitest';
import { GoogleGeminiProvider, AnthropicProvider } from '../../src/utils/ai-providers.js';
import { PromptFactory } from '../../src/utils/prompt-factory.js';
import { sampleTranscripts } from '../utils/fixtures.js';

const hasGoogleKey = !!import.meta.env.GOOGLE_GEMINI_API_KEY;
const hasAnthropicKey = !!import.meta.env.ANTHROPIC_API_KEY;
const hasBothKeys = hasGoogleKey && hasAnthropicKey;

describe.skipIf(!hasBothKeys)('Model Comparison', () => {
  let googleProvider: GoogleGeminiProvider;
  let anthropicProvider: AnthropicProvider;
  let promptFactory: PromptFactory;

  test.beforeAll(() => {
    googleProvider = new GoogleGeminiProvider(import.meta.env.GOOGLE_GEMINI_API_KEY);
    anthropicProvider = new AnthropicProvider(import.meta.env.ANTHROPIC_API_KEY);
    promptFactory = new PromptFactory();
  });

  describe('YouTube content generation comparison', () => {
    it('should generate content from both providers', async () => {
      const prompt = promptFactory.createYouTubePrompt(sampleTranscripts.medium);

      const googleResult = await googleProvider.generateContent(prompt);
      const anthropicResult = await anthropicProvider.generateContent(prompt);

      expect(googleResult.text).toBeDefined();
      expect(anthropicResult.text).toBeDefined();

      expect(googleResult.text.length).toBeGreaterThan(50);
      expect(anthropicResult.text.length).toBeGreaterThan(50);

      console.log('\n=== GOOGLE GEMINI RESPONSE ===');
      console.log(googleResult.text.substring(0, 200));
      console.log('\n=== ANTHROPIC CLAUDE RESPONSE ===');
      console.log(anthropicResult.text.substring(0, 200));
    }, 60000);

    it('should compare response lengths', async () => {
      const prompt = promptFactory.createYouTubePrompt(sampleTranscripts.medium);

      const googleResult = await googleProvider.generateContent(prompt);
      const anthropicResult = await anthropicProvider.generateContent(prompt);

      const lengthDiff = Math.abs(googleResult.text.length - anthropicResult.text.length);
      const avgLength = (googleResult.text.length + anthropicResult.text.length) / 2;

      console.log(`\nGoogle length: ${googleResult.text.length}`);
      console.log(`Claude length: ${anthropicResult.text.length}`);
      console.log(`Difference: ${lengthDiff} (${((lengthDiff / avgLength) * 100).toFixed(1)}%)`);

      // Both should generate substantial content
      expect(googleResult.text.length).toBeGreaterThan(50);
      expect(anthropicResult.text.length).toBeGreaterThan(50);
    }, 60000);
  });

  describe('Keywords extraction comparison', () => {
    it('should extract keywords from both providers', async () => {
      const prompt = promptFactory.createKeywordsPrompt(sampleTranscripts.medium);

      const googleResult = await googleProvider.generateContent(prompt);
      const anthropicResult = await anthropicProvider.generateContent(prompt);

      expect(googleResult.text).toBeDefined();
      expect(anthropicResult.text).toBeDefined();

      console.log('\n=== GOOGLE KEYWORDS ===');
      console.log(googleResult.text);
      console.log('\n=== CLAUDE KEYWORDS ===');
      console.log(anthropicResult.text);
    }, 60000);
  });

  describe('Response time comparison', () => {
    it('should measure response times for both providers', async () => {
      const prompt = promptFactory.createYouTubePrompt(sampleTranscripts.short);

      const googleStart = Date.now();
      const googleResult = await googleProvider.generateContent(prompt);
      const googleTime = Date.now() - googleStart;

      const anthropicStart = Date.now();
      const anthropicResult = await anthropicProvider.generateContent(prompt);
      const anthropicTime = Date.now() - anthropicStart;

      console.log(`\nGoogle Gemini response time: ${googleTime}ms`);
      console.log(`Anthropic Claude response time: ${anthropicTime}ms`);

      expect(googleResult.text).toBeDefined();
      expect(anthropicResult.text).toBeDefined();

      // Both should respond within reasonable time (30s)
      expect(googleTime).toBeLessThan(30000);
      expect(anthropicTime).toBeLessThan(30000);
    }, 60000);
  });

  describe('Consistency comparison', () => {
    it('should generate consistent quality from same provider', async () => {
      const prompt = promptFactory.createYouTubePrompt(sampleTranscripts.short);

      const result1 = await googleProvider.generateContent(prompt);
      const result2 = await googleProvider.generateContent(prompt);

      // Results should be different (AI is not deterministic)
      expect(result1.text).toBeDefined();
      expect(result2.text).toBeDefined();

      // But both should meet quality standards
      expect(result1.text.length).toBeGreaterThan(100);
      expect(result2.text.length).toBeGreaterThan(100);

      // Both should be about JavaScript
      expect(result1.text.toLowerCase()).toMatch(/javascript|digital|transformation/);
      expect(result2.text.toLowerCase()).toMatch(/javascript|digital|transformation/);

      // Both should have proper structure (not identical but similar quality)
      expect(result1.text).toMatch(/[.!?]/);
      expect(result2.text).toMatch(/[.!?]/);

      // Variation is expected - results should not be identical
      expect(result1.text).not.toBe(result2.text);
    }, 60000);
  });
});

describe.skipIf(!hasGoogleKey)('Google Gemini Only', () => {
  it('should test Google when only Google key available', async () => {
    const provider = new GoogleGeminiProvider(import.meta.env.GOOGLE_GEMINI_API_KEY);
    const promptFactory = new PromptFactory();
    const prompt = promptFactory.createYouTubePrompt(sampleTranscripts.short);

    const result = await provider.generateContent(prompt);
    expect(result.text).toBeDefined();
  }, 30000);
});

describe.skipIf(!hasAnthropicKey)('Anthropic Claude Only', () => {
  it('should test Claude when only Anthropic key available', async () => {
    const provider = new AnthropicProvider(import.meta.env.ANTHROPIC_API_KEY);
    const promptFactory = new PromptFactory();
    const prompt = promptFactory.createYouTubePrompt(sampleTranscripts.short);

    const result = await provider.generateContent(prompt);
    expect(result.text).toBeDefined();
  }, 30000);
});
