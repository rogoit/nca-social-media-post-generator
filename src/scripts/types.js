// Browser-compatible type definitions and constants
// NOTE: Validation logic must match src/utils/validation.ts (server is authoritative)
// These are duplicated for client-side UX; server performs final validation

export const PLATFORM_PREFIXES = {
  youtube: "yt",
  linkedin: "li",
  twitter: "tw",
  instagram: "ig",
  tiktok: "tt",
  keywords: "kw",
};

export const VALIDATION_LIMITS = {
  MAX_KEYWORDS: 3,
};

// Duration pattern: MM:SS format (e.g., "7:16", "45:30")
export const DURATION_PATTERN = /^([0-9]{1,2}):([0-5][0-9])$/;

/**
 * Validates transcript input (client-side)
 * Must match: src/utils/validation.ts#validateTranscript
 */
export function validateTranscript(transcript) {
  if (!transcript || typeof transcript !== "string") {
    return ERROR_MESSAGES.INVALID_TRANSCRIPT;
  }
  const trimmed = transcript.trim();
  if (trimmed.length === 0) {
    return ERROR_MESSAGES.INVALID_TRANSCRIPT;
  }
  return null;
}

/**
 * Validates video duration format (client-side)
 * Must match: src/utils/validation.ts#validateVideoDuration
 */
export function validateVideoDuration(duration) {
  if (!duration || duration.trim() === "") {
    return null; // Optional field
  }
  if (!DURATION_PATTERN.test(duration.trim())) {
    return ERROR_MESSAGES.INVALID_DURATION;
  }
  return null;
}

export const ERROR_MESSAGES = {
  INVALID_TRANSCRIPT: "Bitte gib ein gültiges Transkript ein.",
  INVALID_DURATION: "Bitte gib die Video-Dauer im Format MM:SS ein (z.B. 7:16).",
  GENERATION_FAILED: "Ein Fehler ist beim Generieren des Inhalts aufgetreten.",
  COPY_FAILED: "Text konnte nicht kopiert werden.",
  KEYWORD_DETECTION_FAILED: "Fehler beim Erkennen der Keywords: ",
  NETWORK_ERROR: "Netzwerkfehler. Bitte versuche es erneut.",
};

export const UI_MESSAGES = {
  DETECTING_KEYWORDS: "Erkennt...",
  DETECT_KEYWORDS: "Keywords automatisch erkennen",
  COPIED: "Kopiert!",
  ANALYZING: "Transkript wird analysiert und Content generiert...",
};

export const PLATFORM_CONFIGS = {
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
};
