import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleGeminiProvider, AnthropicProvider, AIProviderManager } from '../../src/utils/ai-providers.js';
import { AI_MODELS } from '../../src/config/constants.js';
import { mockGeminiGenerate, mockClaudeCreate, setupSuccessfulMocks, setupGeminiFailure, setupAllProvidersFail, resetAllMocks } from '../utils/ai-mocks.js';

// Mock the external AI SDKs
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: vi.fn(() => ({
      generateContent: mockGeminiGenerate,
    })),
  })),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: {
      create: mockClaudeCreate,
    },
  })),
}));

describe('AI Provider Manager - Functional Tests', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('GoogleGeminiProvider workflows', () => {
    it('should initialize with correct name and models', () => {
      const provider = new GoogleGeminiProvider('test-api-key');
      expect(provider.name).toBe('Google Gemini');
      expect(provider.models).toEqual(AI_MODELS.google);
    });

    it('should sanitize API key during initialization', () => {
      const provider = new GoogleGeminiProvider('"test-api-key"');
      expect(provider.name).toBe('Google Gemini');
    });

    it('should successfully generate content with first model', async () => {
      mockGeminiGenerate.mockResolvedValueOnce({
        response: {
          text: () => 'Generated content',
        },
      });

      const provider = new GoogleGeminiProvider('test-api-key');
      const result = await provider.generateContent('test prompt');

      expect(result).toEqual({
        text: 'Generated content',
        model: AI_MODELS.google[0],
      });
    });

    it('should fallback to second model if first fails', async () => {
      mockGeminiGenerate
        .mockRejectedValueOnce(new Error('First model failed'))
        .mockResolvedValueOnce({
          response: {
            text: () => 'Fallback content',
          },
        });

      const provider = new GoogleGeminiProvider('test-api-key');
      const result = await provider.generateContent('test prompt');

      expect(result).toEqual({
        text: 'Fallback content',
        model: AI_MODELS.google[1],
      });
      expect(mockGeminiGenerate).toHaveBeenCalledTimes(2);
    });

    it('should throw error if all models fail', async () => {
      mockGeminiGenerate.mockRejectedValue(new Error('All models failed'));

      const provider = new GoogleGeminiProvider('test-api-key');

      await expect(provider.generateContent('test prompt')).rejects.toThrow('Google Gemini failed');
    });
  });

  describe('AnthropicProvider workflows', () => {
    it('should initialize with correct name and models', () => {
      const provider = new AnthropicProvider('test-api-key');
      expect(provider.name).toBe('Anthropic Claude');
      expect(provider.models).toEqual(AI_MODELS.anthropic);
    });

    it('should successfully generate content', async () => {
      mockClaudeCreate.mockResolvedValueOnce({
        content: [{ text: 'Anthropic generated content' }],
      });

      const provider = new AnthropicProvider('test-api-key');
      const result = await provider.generateContent('test prompt');

      expect(result).toEqual({
        text: 'Anthropic generated content',
        model: AI_MODELS.anthropic[0],
      });
    });

    it('should fallback to second model if first fails', async () => {
      mockClaudeCreate
        .mockRejectedValueOnce(new Error('First model failed'))
        .mockResolvedValueOnce({
          content: [{ text: 'Fallback anthropic content' }],
        });

      const provider = new AnthropicProvider('test-api-key');
      const result = await provider.generateContent('test prompt');

      expect(result).toEqual({
        text: 'Fallback anthropic content',
        model: AI_MODELS.anthropic[1],
      });
      expect(mockClaudeCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('AIProviderManager workflows', () => {
    it('should initialize with both providers when API keys provided', () => {
      const manager = new AIProviderManager('google-key', 'anthropic-key');
      expect(manager).toBeDefined();
    });

    it('should throw error when no API keys provided', () => {
      expect(() => new AIProviderManager()).toThrow('No API keys provided for AI providers');
    });

    it('should use Google Gemini successfully', async () => {
      mockGeminiGenerate.mockResolvedValueOnce({
        response: {
          text: () => 'Google success',
        },
      });

      const manager = new AIProviderManager('google-key');
      const result = await manager.generateContent('test prompt');

      expect(result.text).toBe('Google success');
      expect(result.model).toBe(AI_MODELS.google[0]);
      expect(mockGeminiGenerate).toHaveBeenCalled();
    });

    it('should fallback from Google to Anthropic on failure', async () => {
      setupGeminiFailure();

      const manager = new AIProviderManager('google-key', 'anthropic-key');
      const result = await manager.generateContent('test prompt');

      expect(result.text).toBe('Mock Claude response');
      expect(result.model).toBe(AI_MODELS.anthropic[0]);
      expect(mockGeminiGenerate).toHaveBeenCalled();
      expect(mockClaudeCreate).toHaveBeenCalled();
    });

    it('should throw error when all providers fail', async () => {
      setupAllProvidersFail();

      const manager = new AIProviderManager('google-key', 'anthropic-key');

      await expect(manager.generateContent('test prompt')).rejects.toThrow('All AI providers failed');
    });

    it('should track errors from failed providers', async () => {
      setupAllProvidersFail();

      const manager = new AIProviderManager('google-key', 'anthropic-key');

      try {
        await manager.generateContent('test prompt');
      } catch (error) {
        // Expected to fail
      }

      const errors = manager.getLastErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.provider === 'Google Gemini')).toBe(true);
    });
  });
});
