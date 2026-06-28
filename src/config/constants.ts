import type { SocialMediaPlatform, PlatformConfig } from "../types/index.js";

export const PLATFORM_PREFIXES: Record<SocialMediaPlatform, string> = {
  youtube: "yt",
  linkedin: "li",
  twitter: "tw",
  instagram: "ig",
  tiktok: "tt",
  keywords: "kw",
} as const;

export const VALIDATION_LIMITS = {
  MAX_KEYWORDS: 3,
} as const;

export const CHARACTER_LIMITS = {
  twitter: 280,
  instagram: { min: 500, max: 800 },
  youtube: { description: 1500 },
  linkedin: { min: 1000, max: 1500 },
  tiktok: { min: 150, max: 300 },
} as const;

// AI Models - configured via environment variables with fallback defaults
const getGoogleModels = (): readonly string[] => {
  const models = import.meta.env.GOOGLE_GEMINI_MODELS;
  if (models) {
    return models.split(",").map((m: string) => m.trim());
  }
  return ["gemini-2.5-pro", "gemini-2.5-flash"];
};

const getMistralModels = (): readonly string[] => {
  const models = import.meta.env.MISTRAL_MODELS;
  if (models) {
    return models.split(",").map((m: string) => m.trim());
  }
  return ["mistral-large-latest"];
};

export const AI_MODELS = {
  google: getGoogleModels(),
  mistral: getMistralModels(),
} as const;

export const PLATFORM_CONFIGS: Record<SocialMediaPlatform, PlatformConfig> = {
  youtube: {
    name: "YouTube",
    endpoint: "youtube",
    spinner: "youtube-spinner",
    result: "yt-result",
    color: {
      primary: "red-600",
      secondary: "red-700",
    },
  },
  linkedin: {
    name: "LinkedIn",
    endpoint: "linkedin",
    spinner: "linkedin-spinner",
    result: "li-result",
    color: {
      primary: "blue-600",
      secondary: "blue-700",
    },
  },
  twitter: {
    name: "Twitter",
    endpoint: "twitter",
    spinner: "twitter-spinner",
    result: "tw-result",
    color: {
      primary: "black",
      secondary: "gray-800",
    },
    characterLimits: {
      max: CHARACTER_LIMITS.twitter,
    },
  },
  instagram: {
    name: "Instagram",
    endpoint: "instagram",
    spinner: "instagram-spinner",
    result: "ig-result",
    color: {
      primary: "pink-500",
      secondary: "pink-600",
    },
    characterLimits: CHARACTER_LIMITS.instagram,
  },
  tiktok: {
    name: "TikTok",
    endpoint: "tiktok",
    spinner: "tiktok-spinner",
    result: "tt-result",
    color: {
      primary: "black",
      secondary: "gray-800",
    },
    characterLimits: CHARACTER_LIMITS.tiktok,
  },
  keywords: {
    name: "Keywords",
    endpoint: "keywords",
    spinner: "",
    result: "",
    color: {
      primary: "indigo-600",
      secondary: "indigo-700",
    },
  },
} as const;

export const ERROR_MESSAGES = {
  INVALID_TRANSCRIPT: "Bitte gib ein gültiges Transkript ein.",
  INVALID_DURATION: "Bitte gib die Video-Dauer im Format MM:SS ein (z.B. 7:16).",
  GENERATION_FAILED: "Ein Fehler ist beim Generieren des Inhalts aufgetreten.",
  COPY_FAILED: "Text konnte nicht kopiert werden.",
  KEYWORD_DETECTION_FAILED: "Fehler beim Erkennen der Keywords: ",
  NETWORK_ERROR: "Netzwerkfehler. Bitte versuche es erneut.",
} as const;

export const VIDEO_CONSTANTS = {
  MAX_SIZE_BYTES: 100 * 1024 * 1024,
  ALLOWED_TYPES: ["video/mp4", "video/quicktime", "video/webm"] as const,
  TRANSCRIPT_PROMPT: `Extrahiere das gesprochene Wort aus diesem Video als vollständiges Transkript.
Gib NUR den gesprochenen Text zurück, ohne Zeitstempel, ohne Formatierung, ohne Erklärungen.
Nur der reine gesprochene Text als durchgehender Fließtext.`,
} as const;

export const UI_MESSAGES = {
  DETECTING_KEYWORDS: "Erkennt...",
  DETECT_KEYWORDS: "Keywords automatisch erkennen",
  COPIED: "Kopiert!",
  ANALYZING: "Transkript wird analysiert und Content generiert...",
} as const;
