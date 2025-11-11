import { vi } from 'vitest';

/**
 * Mock functions for AI providers
 */
export const mockGeminiGenerate = vi.fn();
export const mockClaudeCreate = vi.fn();

/**
 * Mock Google Gemini SDK
 */
export const mockGeminiProvider = () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: vi.fn(() => ({
      generateContent: mockGeminiGenerate,
    })),
  })),
});

/**
 * Mock Anthropic Claude SDK
 */
export const mockClaudeProvider = () => ({
  default: vi.fn(() => ({
    messages: {
      create: mockClaudeCreate,
    },
  })),
});

/**
 * Setup default successful responses for both providers
 */
export function setupSuccessfulMocks() {
  mockGeminiGenerate.mockResolvedValue({
    response: {
      text: () => 'Mock Gemini response',
    },
  });

  mockClaudeCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'Mock Claude response' }],
  });
}

/**
 * Setup Gemini failure, Claude success (for failover testing)
 */
export function setupGeminiFailure() {
  mockGeminiGenerate.mockRejectedValue(new Error('Gemini API error'));

  mockClaudeCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'Mock Claude response' }],
  });
}

/**
 * Setup all providers to fail (for error testing)
 */
export function setupAllProvidersFail() {
  mockGeminiGenerate.mockRejectedValue(new Error('Gemini API error'));
  mockClaudeCreate.mockRejectedValue(new Error('Claude API error'));
}

/**
 * Reset all mocks
 */
export function resetAllMocks() {
  vi.clearAllMocks();
}
