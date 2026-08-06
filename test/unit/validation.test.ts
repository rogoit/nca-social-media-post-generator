import { describe, it, expect } from "vitest";
import {
  validateTranscript,
  validateVideoDuration,
  validateKeywords,
  sanitizeApiKey,
  validateVideoFile,
} from "../../src/utils/validation.js";

describe("Validation Utilities", () => {
  describe("validateTranscript", () => {
    it("should accept valid transcripts", () => {
      const validTranscript = "This is a valid transcript.";
      expect(validateTranscript(validTranscript)).toBe(null);
    });

    it("should accept short transcripts", () => {
      const shortTranscript = "Valid";
      expect(validateTranscript(shortTranscript)).toBe(null);
    });

    it("should reject null or undefined transcripts", () => {
      expect(validateTranscript(null as any)).toBe("Bitte gib ein gültiges Transkript ein.");
      expect(validateTranscript(undefined as any)).toBe("Bitte gib ein gültiges Transkript ein.");
    });

    it("should reject non-string transcripts", () => {
      expect(validateTranscript(123 as any)).toBe("Bitte gib ein gültiges Transkript ein.");
      expect(validateTranscript({} as any)).toBe("Bitte gib ein gültiges Transkript ein.");
    });

    it("should reject empty transcripts", () => {
      const emptyTranscript = "";
      expect(validateTranscript(emptyTranscript)).toBe("Bitte gib ein gültiges Transkript ein.");
    });

    it("should accept very long transcripts", () => {
      const longTranscript = "A".repeat(50000);
      expect(validateTranscript(longTranscript)).toBe(null);
    });

    it("should handle whitespace-only transcripts", () => {
      const whitespaceTranscript = "   \n\t   ";
      expect(validateTranscript(whitespaceTranscript)).toBe(
        "Bitte gib ein gültiges Transkript ein."
      );
    });

    it("should trim whitespace before validation", () => {
      const transcriptWithWhitespace = "   Valid content   ";
      expect(validateTranscript(transcriptWithWhitespace)).toBe(null);
    });
  });

  describe("validateVideoDuration", () => {
    it("should accept valid duration formats", () => {
      expect(validateVideoDuration("7:16")).toBe(null);
      expect(validateVideoDuration("12:45")).toBe(null);
      expect(validateVideoDuration("0:30")).toBe(null);
      expect(validateVideoDuration("99:59")).toBe(null);
    });

    it("should reject invalid duration formats", () => {
      const errorMessage = "Bitte gib die Video-Dauer im Format MM:SS ein (z.B. 7:16).";
      expect(validateVideoDuration("7")).toBe(errorMessage);
      expect(validateVideoDuration("7:60")).toBe(errorMessage);
      expect(validateVideoDuration("100:45")).toBe(errorMessage);
      expect(validateVideoDuration("ab:cd")).toBe(errorMessage);
      expect(validateVideoDuration("7:1")).toBe(errorMessage);
    });

    it("should accept empty or null durations (optional field)", () => {
      expect(validateVideoDuration("")).toBe(null);
      expect(validateVideoDuration("   ")).toBe(null);
      expect(validateVideoDuration(undefined)).toBe(null);
    });

    it("should trim whitespace before validation", () => {
      expect(validateVideoDuration("  7:16  ")).toBe(null);
    });
  });

  describe("validateKeywords", () => {
    it("should accept valid keyword arrays", () => {
      expect(validateKeywords(["keyword1"])).toBe(null);
      expect(validateKeywords(["keyword1", "keyword2"])).toBe(null);
      expect(validateKeywords(["keyword1", "keyword2", "keyword3"])).toBe(null);
    });

    it("should reject too many keywords", () => {
      const tooManyKeywords = ["k1", "k2", "k3", "k4"];
      expect(validateKeywords(tooManyKeywords)).toBe("Maximal 3 Keywords erlaubt.");
    });

    it("should accept empty keyword arrays", () => {
      expect(validateKeywords([])).toBe(null);
    });
  });

  describe("sanitizeApiKey", () => {
    it("should remove quotes and trim whitespace", () => {
      expect(sanitizeApiKey('"api-key-123"')).toBe("api-key-123");
      expect(sanitizeApiKey("'api-key-123'")).toBe("api-key-123");
      expect(sanitizeApiKey("  api-key-123  ")).toBe("api-key-123");
      expect(sanitizeApiKey('  "api-key-123"  ')).toBe("api-key-123");
    });

    it("should handle undefined or null keys", () => {
      expect(sanitizeApiKey(undefined)).toBe("");
      expect(sanitizeApiKey(null as any)).toBe("");
    });

    it("should handle empty strings", () => {
      expect(sanitizeApiKey("")).toBe("");
      expect(sanitizeApiKey("   ")).toBe("");
    });

    it("should handle keys without quotes", () => {
      expect(sanitizeApiKey("api-key-123")).toBe("api-key-123");
    });
  });

  describe("validateVideoFile", () => {
    it("should accept valid video files", () => {
      expect(validateVideoFile({ name: "video.mp4", size: 50_000_000, type: "video/mp4" })).toBe(
        null
      );
    });

    it("should accept arbitrarily large video files (no size cap)", () => {
      expect(validateVideoFile({ name: "huge.mp4", size: 5_000_000_000, type: "video/mp4" })).toBe(
        null
      );
    });

    it("should reject non-video mime types", () => {
      expect(validateVideoFile({ name: "doc.pdf", size: 1000, type: "application/pdf" })).toContain(
        "MP4, MOV, WebM"
      );
    });

    it("should accept MOV files", () => {
      expect(
        validateVideoFile({ name: "video.mov", size: 50_000_000, type: "video/quicktime" })
      ).toBe(null);
    });

    it("should accept WebM files", () => {
      expect(validateVideoFile({ name: "video.webm", size: 50_000_000, type: "video/webm" })).toBe(
        null
      );
    });

    it("should reject null input", () => {
      expect(validateVideoFile(null as any)).toContain("Video");
    });
  });
});
