import { describe, it, expect } from "vitest";
import type { SocialMediaPlatform } from "../../src/types/index.js";
import {
  VALIDATION_LIMITS,
  CHARACTER_LIMITS,
  PLATFORM_CONFIGS,
  ERROR_MESSAGES,
} from "../../src/config/constants.js";

describe("Constants Configuration", () => {
  describe("VALIDATION_LIMITS", () => {
    it("should have proper validation limits", () => {
      expect(VALIDATION_LIMITS.MAX_KEYWORDS).toBe(3);
    });
  });

  describe("CHARACTER_LIMITS", () => {
    it("should have character limits for all platforms", () => {
      expect(CHARACTER_LIMITS.instagram.min).toBe(500);
      expect(CHARACTER_LIMITS.instagram.max).toBe(800);
      expect(CHARACTER_LIMITS.youtube.description).toBe(1500);
      expect(CHARACTER_LIMITS.linkedin.min).toBe(1000);
      expect(CHARACTER_LIMITS.linkedin.max).toBe(1500);
      expect(CHARACTER_LIMITS.tiktok.min).toBe(150);
      expect(CHARACTER_LIMITS.tiktok.max).toBe(300);
    });
  });

  describe("PLATFORM_CONFIGS", () => {
    it("should have configurations for all platforms", () => {
      const platforms: SocialMediaPlatform[] = [
        "youtube",
        "linkedin",
        "instagram",
        "tiktok",
        "keywords",
      ];

      platforms.forEach((platform) => {
        expect(PLATFORM_CONFIGS[platform]).toBeDefined();
        expect(PLATFORM_CONFIGS[platform].name).toBeDefined();
        expect(PLATFORM_CONFIGS[platform].endpoint).toBe(platform);
        expect(PLATFORM_CONFIGS[platform].color).toBeDefined();
        expect(PLATFORM_CONFIGS[platform].color.primary).toBeDefined();
        expect(PLATFORM_CONFIGS[platform].color.secondary).toBeDefined();
      });
    });

    it("should have proper color configurations", () => {
      expect(PLATFORM_CONFIGS.youtube.color.primary).toBe("red-600");
      expect(PLATFORM_CONFIGS.linkedin.color.primary).toBe("blue-600");
      expect(PLATFORM_CONFIGS.instagram.color.primary).toBe("pink-500");
      expect(PLATFORM_CONFIGS.tiktok.color.primary).toBe("black");
    });
  });

  describe("ERROR_MESSAGES", () => {
    it("should have German error messages", () => {
      expect(ERROR_MESSAGES.INVALID_TRANSCRIPT).toContain("Transkript");
      expect(ERROR_MESSAGES.INVALID_DURATION).toContain("Video-Dauer");
      expect(ERROR_MESSAGES.GENERATION_FAILED).toContain("Fehler");
      expect(ERROR_MESSAGES.COPY_FAILED).toContain("kopiert");
      expect(ERROR_MESSAGES.KEYWORD_DETECTION_FAILED).toContain("Keywords");
      expect(ERROR_MESSAGES.NETWORK_ERROR).toContain("Netzwerk");
    });

    it("should have proper format instructions", () => {
      expect(ERROR_MESSAGES.INVALID_DURATION).toContain("MM:SS");
      expect(ERROR_MESSAGES.INVALID_DURATION).toContain("7:16");
    });
  });
});
