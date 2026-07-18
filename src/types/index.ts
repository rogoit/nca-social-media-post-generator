export type SocialMediaPlatform =
  | "youtube"
  | "linkedin"
  | "twitter"
  | "instagram"
  | "tiktok"
  | "keywords";

export interface GenerateRequest {
  transcript: string;
  type?: SocialMediaPlatform;
  videoDuration?: string;
  keywords?: string[];
}

export interface GenerateResponse {
  transcript?: string;
  title?: string;
  description?: string;
  timestamps?: string;
  linkedinPost?: string;
  twitterPost?: string;
  instagramPost?: string;
  tiktokPost?: string;
  keywords?: string[];
  transcriptCleaned: boolean;
  modelUsed: string;
  humanizerWarnings?: string[];
  error?: string;
}

export interface AIError {
  status?: number;
  message: string;
  provider: string;
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
