export type SocialMediaPlatform = "youtube" | "linkedin" | "instagram" | "tiktok" | "keywords";

export interface GenerateRequest {
  transcript: string;
  type?: SocialMediaPlatform;
  videoDuration?: string;
  keywords?: string[];
  /** When set, restore the chat session from this persisted run instead of
   * re-running turn 1. Used by single-platform retry on a resumed run. */
  runId?: string;
}

export interface GenerateResponse {
  transcript?: string;
  title?: string;
  description?: string;
  timestamps?: string;
  linkedinPost?: string;
  instagramPost?: string;
  tiktokPost?: string;
  keywords?: string[];
  transcriptCleaned: boolean;
  modelUsed: string;
  humanizerWarnings?: string[];
  error?: string;
}

export interface PlatformConfig {
  name: string;
  endpoint: SocialMediaPlatform;
  spinner: string;
  result: string;
  color: {
    primary: string;
    secondary: string;
  };
  characterLimits?: {
    min?: number;
    max?: number;
  };
}

export interface KeywordState {
  keywords: string[];
  maxKeywords: number;
  detected: boolean;
  set: boolean;
}
