import { VALIDATION_LIMITS, ERROR_MESSAGES } from "../config/constants.js";

// Duration pattern: MM:SS format (e.g., "7:16", "45:30")
const DURATION_PATTERN = /^([0-9]{1,2}):([0-5][0-9])$/;

export function validateTranscript(transcript: string): string | null {
  if (!transcript || typeof transcript !== "string") {
    return ERROR_MESSAGES.INVALID_TRANSCRIPT;
  }

  const trimmed = transcript.trim();
  if (trimmed.length === 0) {
    return ERROR_MESSAGES.INVALID_TRANSCRIPT;
  }

  return null;
}

export function validateVideoDuration(duration?: string): string | null {
  if (!duration || duration.trim() === "") {
    return null; // Optional field
  }

  if (!DURATION_PATTERN.test(duration.trim())) {
    return ERROR_MESSAGES.INVALID_DURATION;
  }

  return null;
}

export function validateKeywords(keywords: string[]): string | null {
  if (keywords.length > VALIDATION_LIMITS.MAX_KEYWORDS) {
    return `Maximal ${VALIDATION_LIMITS.MAX_KEYWORDS} Keywords erlaubt.`;
  }

  return null;
}

export function sanitizeApiKey(key?: string): string {
  if (!key) return "";
  return key.replace(/["']/g, "").trim();
}

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB

export function validateVideoFile(file: { name: string; size: number; type: string }): string | null {
  if (!file) {
    return "Bitte wähle eine Video-Datei aus.";
  }

  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return "Ungültiges Format. Erlaubt sind: MP4, MOV, WebM.";
  }

  if (file.size > MAX_VIDEO_SIZE) {
    return "Die Datei ist zu groß. Maximal 100 MB erlaubt.";
  }

  return null;
}
