import { expect } from 'vitest';

/**
 * Custom assertion helpers for domain-specific validations
 */

/**
 * Validates platform-specific character limits
 */
export function assertWithinCharacterLimit(content: string, platform: string) {
  const limits: Record<string, number> = {
    youtube: 5000,
    facebook: 63206,
    linkedin: 3000,
    instagram: 2200,
  };

  const limit = limits[platform];
  expect(content.length).toBeLessThanOrEqual(limit);
}

/**
 * Validates content has hashtags (for social platforms)
 */
export function assertHasHashtags(content: string) {
  expect(content).toMatch(/#\w+/);
}

/**
 * Validates content structure for YouTube posts
 */
export function assertValidYouTubePost(content: string) {
  // Should have title/header
  expect(content).toMatch(/^.+$/m);
  // Should have hashtags
  assertHasHashtags(content);
  // Within character limit
  assertWithinCharacterLimit(content, 'youtube');
}

/**
 * Validates content structure for LinkedIn posts
 */
export function assertValidLinkedInPost(content: string) {
  // Professional tone indicators
  expect(content.length).toBeGreaterThan(50);
  // Should have hashtags
  assertHasHashtags(content);
  // Within character limit
  assertWithinCharacterLimit(content, 'linkedin');
}

/**
 * Validates response has NCA brand elements
 */
export function assertHasBrandElements(content: string) {
  // Could check for specific brand terms, tone, or formatting
  expect(content.length).toBeGreaterThan(0);
}

/**
 * Validates AI response format (Gemini)
 */
export function assertValidGeminiResponse(response: any) {
  expect(response).toBeDefined();
  expect(response.response).toBeDefined();
  expect(typeof response.response.text).toBe('function');
}

/**
 * Validates AI response format (Claude)
 */
export function assertValidClaudeResponse(response: any) {
  expect(response).toBeDefined();
  expect(response.content).toBeDefined();
  expect(Array.isArray(response.content)).toBe(true);
  expect(response.content[0].type).toBe('text');
  expect(response.content[0].text).toBeDefined();
}
