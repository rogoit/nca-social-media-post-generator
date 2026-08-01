import type { GenerateResponse, SocialMediaPlatform } from "../types/index.js";
import type { MistralResponseFormat } from "../config/schemas.js";
import { ChatPrompts } from "../config/chat-prompts.js";
import { ResponseParser } from "./response-parser.js";
import { AI_MODELS } from "../config/constants.js";
import {
  TRANSCRIPT_RESPONSE_FORMAT,
  getYoutubeResponseFormat,
  LINKEDIN_RESPONSE_FORMAT,
  INSTAGRAM_RESPONSE_FORMAT,
  TIKTOK_RESPONSE_FORMAT,
} from "../config/schemas.js";
import { lintPost, formatViolationsForRetry } from "./humanizer-lint.js";
import { MistralProvider, OllamaProvider, isRetryableError } from "./ai-providers.js";
import type { AIProvider } from "./ai-providers.js";

export type GenerationPlatform = Exclude<SocialMediaPlatform, "keywords">;

export type ProgressEvent =
  | { type: "platform_started"; platform: GenerationPlatform }
  | { type: "humanizer_retry"; platform: GenerationPlatform }
  | { type: "platform_completed"; platform: GenerationPlatform }
  | { type: "model_fallback"; model: string };

export type ProgressCallback = (event: ProgressEvent) => void;

export interface GeneratePlatformResult {
  response: Partial<GenerateResponse>;
  modelUsed: string;
  humanizerWarnings?: string[];
}

const PLATFORM_RESPONSE_FORMATS: Record<
  Exclude<GenerationPlatform, "youtube">,
  MistralResponseFormat
> = {
  linkedin: LINKEDIN_RESPONSE_FORMAT,
  instagram: INSTAGRAM_RESPONSE_FORMAT,
  tiktok: TIKTOK_RESPONSE_FORMAT,
};

/**
 * Request-scoped generation session. Owns one Mistral chat session:
 * turn 1 corrects the transcript and extracts keywords, subsequent turns
 * generate one platform each. No module-level state — safe under concurrency.
 */
export class GenerationSession {
  provider: AIProvider;
  correctedTranscript = "";
  keywords: string[] = [];
  currentModel = "";

  constructor(
    apiKey: string,
    private readonly emit?: ProgressCallback
  ) {
    this.provider = new MistralProvider(apiKey);
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
   * Generates one platform. On 503/429 after provider retries are exhausted,
   * restarts the chat session on the next Mistral model and retries once.
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

    let text: string;
    let model: string;

    try {
      const result = await this.provider.sendChatMessage!(platformMessage, responseFormat);
      text = result.text;
      model = result.model;
    } catch (error: unknown) {
      if (!isRetryableError(error) || !(await this.restartOnFallbackModel(originalTranscript))) {
        throw error;
      }
      this.emit?.({ type: "model_fallback", model: this.currentModel });
      const result = await this.provider.sendChatMessage!(platformMessage, responseFormat);
      text = result.text;
      model = result.model;
    }

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
    responseFormat: MistralResponseFormat,
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

  /**
   * Restarts the chat session on the next configured Mistral model. If no
   * further Mistral model is available, falls back to Ollama Cloud (when
   * OLLAMA_API_KEY is set). Re-runs turn 1 so the session keeps context.
   * Returns false when no fallback remains.
   */
  private async restartOnFallbackModel(originalTranscript: string): Promise<boolean> {
    const currentIndex = AI_MODELS.mistral.indexOf(this.currentModel);
    const nextModel = AI_MODELS.mistral[currentIndex + 1];

    if (nextModel) {
      console.warn(`Restarting chat session on fallback model: ${nextModel}`);
      (this.provider as MistralProvider).startChatSessionWithModel(nextModel);
      await this.reinitialize(originalTranscript);
      return true;
    }

    const ollamaKey = import.meta.env.OLLAMA_API_KEY;
    if (ollamaKey) {
      const ollamaModel = AI_MODELS.ollama;
      console.warn(`Mistral fallback exhausted, switching to Ollama: ${ollamaModel}`);
      this.provider = new OllamaProvider(ollamaKey, ollamaModel);
      this.provider.startChatSession!();
      await this.reinitialize(originalTranscript);
      this.currentModel = `Ollama/${ollamaModel}`;
      return true;
    }

    return false;
  }
}
