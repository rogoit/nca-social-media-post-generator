import { vi } from "vitest";

/**
 * Mock functions for AI providers
 */
export const mockGeminiGenerate = vi.fn();
export const mockMistralGenerate = vi.fn();
export const mockMistralChatMessage = vi.fn();

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
 * Mock Mistral provider
 */
export const mockMistralProvider = () => ({
  generateContent: mockMistralGenerate,
  startChatSession: vi.fn(),
  startChatSessionWithModel: vi.fn(),
  sendChatMessage: mockMistralChatMessage,
});

/**
 * Setup default successful responses
 */
export function setupSuccessfulMocks() {
  mockGeminiGenerate.mockResolvedValue({
    response: {
      text: () => "Mock Gemini response",
    },
  });
  mockMistralGenerate.mockResolvedValue({
    text: JSON.stringify({ result: "Mock Mistral response" }),
    model: "mistral-large-latest",
  });
  mockMistralChatMessage.mockResolvedValue({
    text: JSON.stringify({
      transcript: "This is a test transcript with proper punctuation.",
      keywords: ["javascript", "web-development", "programming"],
    }),
    model: "mistral-large-latest",
  });
}

/**
 * Setup all providers to fail (for error testing)
 */
export function setupAllProvidersFail() {
  mockGeminiGenerate.mockRejectedValue(new Error("Gemini API error"));
  mockMistralGenerate.mockRejectedValue(new Error("Mistral API error"));
  mockMistralChatMessage.mockRejectedValue(new Error("Mistral API error"));
}

/**
 * Reset all mocks
 */
export function resetAllMocks() {
  vi.clearAllMocks();
}
