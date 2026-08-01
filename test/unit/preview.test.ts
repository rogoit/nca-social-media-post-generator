import { describe, it, expect } from "vitest";
import { previewWords } from "../../src/utils/preview.js";

describe("previewWords", () => {
  it("should return an empty string for empty input", () => {
    expect(previewWords("")).toBe("");
  });

  it("should return an empty string for whitespace-only input", () => {
    expect(previewWords("   \n\t  ")).toBe("");
  });

  it("should return the trimmed string unchanged when word count <= n", () => {
    expect(previewWords("one two three", 10)).toBe("one two three");
  });

  it("should return exactly n words unchanged", () => {
    const words = Array.from({ length: 10 }, (_, i) => `w${i}`).join(" ");
    expect(previewWords(words, 10)).toBe(words);
  });

  it("should truncate to n words and append an ellipsis when longer", () => {
    const input = Array.from({ length: 12 }, (_, i) => `w${i}`).join(" ");
    const expected = "w0 w1 w2 w3 w4 w5 w6 w7 w8 w9…";
    expect(previewWords(input, 10)).toBe(expected);
  });

  it("should collapse internal whitespace when truncating", () => {
    const input = "a  b\tc\nd   e\t\tf\n\ng h i j k l";
    expect(previewWords(input, 5)).toBe("a b c d e…");
  });

  it("should trim leading/trailing whitespace before counting", () => {
    expect(previewWords("   one two three four five six   ", 5)).toBe("one two three four five…");
  });

  it("should respect a custom n", () => {
    expect(previewWords("a b c d e f g", 3)).toBe("a b c…");
  });

  it("should default to n=10", () => {
    const input = Array.from({ length: 15 }, (_, i) => `w${i}`).join(" ");
    const expected = "w0 w1 w2 w3 w4 w5 w6 w7 w8 w9…";
    expect(previewWords(input)).toBe(expected);
  });

  it("should handle a single word longer than n", () => {
    expect(previewWords("solo", 10)).toBe("solo");
  });
});
