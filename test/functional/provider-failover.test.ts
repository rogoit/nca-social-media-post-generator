import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIProviderManager } from '../../src/utils/ai-providers.js';
import { AI_MODELS } from '../../src/config/constants.js';
import {
  mockGeminiGenerate,
  mockClaudeCreate,
  setupGeminiFailure,
  setupAllProvidersFail,
  resetAllMocks,
} from '../utils/ai-mocks.js';

// Mock the AI SDKs
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

describe('Provider Failover - Functional Tests', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('Google Gemini primary path', () => {
    it('should use Google Gemini when available', async () => {
      mockGeminiGenerate.mockResolvedValueOnce({
        response: {
          text: () => 'Google response',
        },
      });

      const manager = new AIProviderManager('google-key');
      const result = await manager.generateContent('test prompt');

      expect(result.text).toBe('Google response');
      expect(result.model).toBe(AI_MODELS.google[0]);
      expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
      expect(mockClaudeCreate).not.toHaveBeenCalled();
    });

    it('should try all Google models before failing over', async () => {
      mockGeminiGenerate
        .mockRejectedValueOnce(new Error('Model 1 failed'))
        .mockRejectedValueOnce(new Error('Model 2 failed'));

      mockClaudeCreate.mockResolvedValueOnce({
        content: [{ text: 'Claude response' }],
      });

      const manager = new AIProviderManager('google-key', 'anthropic-key');
      const result = await manager.generateContent('test prompt');

      expect(result.text).toBe('Claude response');
      expect(mockGeminiGenerate).toHaveBeenCalledTimes(AI_MODELS.google.length);
      expect(mockClaudeCreate).toHaveBeenCalled();
    });
  });

  describe('Anthropic Claude failover', () => {
    it('should failover to Claude when Google fails', async () => {
      setupGeminiFailure();

      const manager = new AIProviderManager('google-key', 'anthropic-key');
      const result = await manager.generateContent('test prompt');

      expect(result.text).toBe('Mock Claude response');
      expect(result.model).toBe(AI_MODELS.anthropic[0]);
      expect(mockGeminiGenerate).toHaveBeenCalled();
      expect(mockClaudeCreate).toHaveBeenCalled();
    });

    it('should try all Claude models after Google fails', async () => {
      mockGeminiGenerate.mockRejectedValue(new Error('Google failed'));
      mockClaudeCreate
        .mockRejectedValueOnce(new Error('Claude model 1 failed'))
        .mockResolvedValueOnce({
          content: [{ text: 'Claude model 2 success' }],
        });

      const manager = new AIProviderManager('google-key', 'anthropic-key');
      const result = await manager.generateContent('test prompt');

      expect(result.text).toBe('Claude model 2 success');
      expect(result.model).toBe(AI_MODELS.anthropic[1]);
      expect(mockClaudeCreate).toHaveBeenCalledTimes(2);
    });

    it('should use only Claude when only Claude key provided', async () => {
      mockClaudeCreate.mockResolvedValueOnce({
        content: [{ text: 'Claude only response' }],
      });

      const manager = new AIProviderManager(undefined, 'anthropic-key');
      const result = await manager.generateContent('test prompt');

      expect(result.text).toBe('Claude only response');
      expect(mockGeminiGenerate).not.toHaveBeenCalled();
      expect(mockClaudeCreate).toHaveBeenCalled();
    });
  });

  describe('Complete failure scenarios', () => {
    it('should throw error when all providers fail', async () => {
      setupAllProvidersFail();

      const manager = new AIProviderManager('google-key', 'anthropic-key');

      await expect(manager.generateContent('test prompt')).rejects.toThrow('All AI providers failed');
    });

    it('should collect all errors from failed providers', async () => {
      const googleError = new Error('Google error');
      const claudeError = new Error('Claude error');

      mockGeminiGenerate.mockRejectedValue(googleError);
      mockClaudeCreate.mockRejectedValue(claudeError);

      const manager = new AIProviderManager('google-key', 'anthropic-key');

      try {
        await manager.generateContent('test prompt');
      } catch (error) {
        // Expected
      }

      const errors = manager.getLastErrors();
      expect(errors.length).toBe(2);
      expect(errors.some(e => e.provider === 'Google Gemini')).toBe(true);
      expect(errors.some(e => e.provider === 'Anthropic Claude')).toBe(true);
    });

    it('should throw error when no API keys provided', () => {
      expect(() => new AIProviderManager()).toThrow('No API keys provided for AI providers');
    });
  });

  describe('Error tracking', () => {
    it('should track last errors from each provider', async () => {
      setupAllProvidersFail();

      const manager = new AIProviderManager('google-key', 'anthropic-key');

      try {
        await manager.generateContent('test prompt');
      } catch (error) {
        // Expected
      }

      const errors = manager.getLastErrors();
      expect(errors.length).toBeGreaterThan(0);

      const googleError = errors.find(e => e.provider === 'Google Gemini');
      expect(googleError).toBeDefined();

      const claudeError = errors.find(e => e.provider === 'Anthropic Claude');
      expect(claudeError).toBeDefined();
    });

    it('should clear errors on successful generation', async () => {
      // First attempt fails
      setupAllProvidersFail();
      const manager = new AIProviderManager('google-key', 'anthropic-key');

      try {
        await manager.generateContent('test prompt');
      } catch (error) {
        // Expected
      }

      expect(manager.getLastErrors().length).toBeGreaterThan(0);

      // Second attempt succeeds
      resetAllMocks();
      mockGeminiGenerate.mockResolvedValueOnce({
        response: {
          text: () => 'Success',
        },
      });

      await manager.generateContent('test prompt');

      // Errors should still be present (they don't clear automatically)
      expect(manager.getLastErrors()).toBeDefined();
    });
  });
});
