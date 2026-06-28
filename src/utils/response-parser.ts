import type { SocialMediaPlatform, GenerateResponse } from "../types/index.js";

const HASHTAG_PATTERN = /#[a-zA-Z0-9_äöüÄÖÜß]+/g;

// Strip ALL hyphens and dashes (hyphen-minus, hyphen, non-breaking hyphen, figure dash,
// en-dash, em-dash, horizontal bar, minus sign) and replace with a space, then collapse
// resulting double spaces. Hard guarantee that no dash-like character reaches the output.
function normalizeDashes(text: string): string {
  return text.replace(/[\u002D\u2010-\u2015\u2212]/g, " ").replace(/ {2,}/g, " ");
}

function normalizeHashtags(text: string): string {
  return text.replace(HASHTAG_PATTERN, (hashtag) => hashtag.toLowerCase());
}

const HASHTAG_FIELDS = new Set<keyof GenerateResponse>([
  "description",
  "linkedinPost",
  "twitterPost",
  "instagramPost",
  "tiktokPost",
]);

export class ResponseParser {
  static validateResponse(type: SocialMediaPlatform, response: Partial<GenerateResponse>): string | null {
    switch (type) {
      case "youtube":
        if (!response.title?.trim() || !response.description?.trim()) {
          return "AI response missing required YouTube content (title or description)";
        }
        break;
      case "linkedin":
        if (!response.linkedinPost?.trim()) {
          return "AI response missing LinkedIn post content";
        }
        break;
      case "twitter":
        if (!response.twitterPost?.trim()) {
          return "AI response missing Twitter post content";
        }
        break;
      case "instagram":
        if (!response.instagramPost?.trim()) {
          return "AI response missing Instagram post content";
        }
        break;
      case "tiktok":
        if (!response.tiktokPost?.trim()) {
          return "AI response missing TikTok post content";
        }
        break;
      case "keywords":
        if (!response.keywords || response.keywords.length === 0) {
          return "AI response missing keywords";
        }
        break;
    }
    return null;
  }

  static parseResponse(type: SocialMediaPlatform, text: string): Partial<GenerateResponse> {
    const parsed = this.safeParseJson(text);
    if (!parsed) {
      return {};
    }

    const target = parsed as Record<string, unknown>;

    for (const [field, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        let normalized = normalizeDashes(value);
        if (HASHTAG_FIELDS.has(field as keyof GenerateResponse)) {
          normalized = normalizeHashtags(normalized);
        }
        target[field] = normalized;
      }
      if (Array.isArray(value)) {
        target[field] = value.map((item) =>
          typeof item === "string" ? normalizeDashes(item) : item
        );
      }
    }

    return parsed;
  }

  private static safeParseJson(text: string): Partial<GenerateResponse> | null {
    try {
      return JSON.parse(text) as Partial<GenerateResponse>;
    } catch {
      console.error("Failed to parse AI JSON response:", text.slice(0, 200));
      return null;
    }
  }
}
