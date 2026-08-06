import type { GenerateResponse, SocialMediaPlatform } from "../types/index.js";
import type { StructuredResponseFormat } from "../config/schemas.js";
import { ChatPrompts } from "../config/chat-prompts.js";
import { ResponseParser } from "./response-parser.js";
import {
  TRANSCRIPT_RESPONSE_FORMAT,
  getYoutubeResponseFormat,
  LINKEDIN_RESPONSE_FORMAT,
  INSTAGRAM_RESPONSE_FORMAT,
  TIKTOK_RESPONSE_FORMAT,
} from "../config/schemas.js";
import { lintPost, formatViolationsForRetry } from "./humanizer-lint.js";
import type { AIProvider } from "./ai-providers.js";

export type GenerationPlatform = Exclude<SocialMediaPlatform, "keywords">;

export type ProgressEvent =
  | { type: "platform_started"; platform: GenerationPlatform }
  | { type: "humanizer_retry"; platform: GenerationPlatform }
  | { type: "platform_completed"; platform: GenerationPlatform };

export type ProgressCallback = (event: ProgressEvent) => void;

export interface GeneratePlatformResult {
  response: Partial<GenerateResponse>;
  modelUsed: string;
  humanizerWarnings?: string[];
}

const PLATFORM_RESPONSE_FORMATS: Record<
  Exclude<GenerationPlatform, "youtube">,
  StructuredResponseFormat
> = {
  linkedin: LINKEDIN_RESPONSE_FORMAT,
  instagram: INSTAGRAM_RESPONSE_FORMAT,
  tiktok: TIKTOK_RESPONSE_FORMAT,
};

/**
 * Request-scoped generation session. Owns one Ollama chat session:
 * turn 1 corrects the transcript and extracts keywords, subsequent turns
 * generate one platform each. No module-level state — safe under concurrency.
 * The provider is injected so the caller picks the configured text backend.
 */
export class GenerationSession {
  provider: AIProvider;
  correctedTranscript = "";
  keywords: string[] = [];
  currentModel = "";

  constructor(
    provider: AIProvider,
    private readonly emit?: ProgressCallback
  ) {
    this.provider = provider;
  }

  /**
   * Starts a fresh chat session and runs turn 1: transcript correction + keywords.
   */
  async initialize(transcript: string): Promise<{
    correctedTranscript: string;
    keywords: string[];
    model: string;
  }> {
    this.provider.startChatSession!();
    return this.reinitialize(transcript);
  }

  /**
   * Restores a session from a persisted run (resume path). Replaces the chat
   * message history so subsequent platform turns continue the same conversation
   * — turn 1 (transcript correction + keywords) is NOT re-run, saving an AI
   * call and keeping the corrected transcript stable across retries.
   */
  restoreFrom(data: {
    chatHistory: Array<{ role: string; content: string }>;
    correctedTranscript: string;
    keywords: string[];
    model: string;
  }): void {
    this.provider.restoreChatHistory!(data.chatHistory);
    this.correctedTranscript = data.correctedTranscript;
    this.keywords = data.keywords;
    this.currentModel = data.model;
  }

  /** Snapshot the chat message history for persistence (after each turn). */
  serializeChatHistory(): Array<{ role: string; content: string }> {
    return this.provider.serializeChatHistory!();
  }

  /**
   * Turn 1 without resetting the chat session — used after a fallback-model restart,
   * where startChatSessionWithModel already created a fresh session.
   */
  private async reinitialize(transcript: string): Promise<{
    correctedTranscript: string;
    keywords: string[];
    model: string;
  }> {
    const initialMessage = ChatPrompts.createInitialMessage(transcript);
    const { text, model } = await this.provider.sendChatMessage!(
      initialMessage,
      TRANSCRIPT_RESPONSE_FORMAT
    );

    const transcriptResult = ResponseParser.parseResponse("youtube", text);
    const keywordResult = ResponseParser.parseResponse("keywords", text);

    this.correctedTranscript = transcriptResult.transcript || transcript;
    this.keywords = keywordResult.keywords || [];
    this.currentModel = model;

    return {
      correctedTranscript: this.correctedTranscript,
      keywords: this.keywords,
      model,
    };
  }

  /**
   * Generates one platform. Transient errors (429/503) are retried inside the
   * provider's withRetry; persistent failures rethrow so the caller can emit a
   * per-platform error (the pipeline continues with the remaining platforms).
   * Humanizer lint runs on the output; one corrective retry is attempted,
   * then remaining violations are surfaced as warnings.
   */
  async generatePlatform(
    platform: GenerationPlatform,
    originalTranscript: string,
    options: { videoDuration?: string } = {}
  ): Promise<GeneratePlatformResult> {
    this.emit?.({ type: "platform_started", platform });

    const platformMessage = ChatPrompts.createPlatformMessage(platform, {
      videoDuration: options.videoDuration,
    });
    const responseFormat =
      platform === "youtube"
        ? getYoutubeResponseFormat(options.videoDuration)
        : PLATFORM_RESPONSE_FORMATS[platform];

    const { text, model } = await this.provider.sendChatMessage!(platformMessage, responseFormat);

    const parsedResponse = ResponseParser.parseResponse(platform, text);
    const validationError = ResponseParser.validateResponse(platform, parsedResponse);
    if (validationError) {
      throw new Error(`AI-Antwort enthält keine gültigen Inhalte: ${validationError}`);
    }

    const linted = await this.applyHumanizerLint(text, responseFormat, platform);

    const finalParsedResponse =
      linted.text !== text ? ResponseParser.parseResponse(platform, linted.text) : parsedResponse;

    if (platform === "youtube") {
      finalParsedResponse.transcript = this.correctedTranscript || undefined;
    }

    this.emit?.({ type: "platform_completed", platform });

    return {
      response: finalParsedResponse,
      modelUsed: model,
      humanizerWarnings: linted.warnings.length > 0 ? linted.warnings : undefined,
    };
  }

  private async applyHumanizerLint(
    text: string,
    responseFormat: StructuredResponseFormat,
    platform: GenerationPlatform
  ): Promise<{ text: string; warnings: string[] }> {
    const report = lintPost(text);
    if (!report.blocked) {
      return { text, warnings: [] };
    }

    this.emit?.({ type: "humanizer_retry", platform });

    const forbiddenList = formatViolationsForRetry(report);
    const retryMessage = `Überarbeite deine letzte Antwort. Ersetze unbedingt diese Wörter und Muster: ${forbiddenList}. Behalte alle Fakten, Zahlen, Aussagen und das JSON-Format bei. Gib NUR das überarbeitete JSON-Objekt zurück.`;

    try {
      const retryResult = await this.provider.sendChatMessage!(retryMessage, responseFormat);
      const retryReport = lintPost(retryResult.text);

      if (!retryReport.blocked) {
        return { text: retryResult.text, warnings: [] };
      }
      if (retryReport.violations.length < report.violations.length) {
        return {
          text: retryResult.text,
          warnings: Array.from(new Set(retryReport.violations.map((v) => v.word))),
        };
      }
    } catch (retryError) {
      console.warn("Humanizer retry failed:", retryError);
    }

    return {
      text,
      warnings: Array.from(new Set(report.violations.map((v) => v.word))),
    };
  }
}
