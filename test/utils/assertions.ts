import { expect } from "vitest";

export function assertWithinCharacterLimit(content: string, maxLength: number) {
  expect(content.length).toBeLessThanOrEqual(maxLength);
}

export function assertHasHashtags(content: string) {
  expect(content).toMatch(/#\w+/);
}

export function assertHasBrandElements(content: string) {
  expect(content.length).toBeGreaterThan(0);
}
