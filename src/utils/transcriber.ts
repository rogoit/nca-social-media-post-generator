import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { TRANSCRIPTION_CONSTANTS } from "../config/constants.js";
import { isRetryableError } from "./ai-providers.js";

/**
 * Transcribes a WAV audio file via the Mistral audio transcription API
 * (Voxtral). Kept minimal on purpose: one request in, transcript text out.
 * All state is request-scoped; callers are responsible for providing a WAV
 * file (see audio-extraction.ts for the video-to-audio step).
 */
export interface TranscriptionResult {
  text: string;
  model: string;
}

export class TranscriptionError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "TranscriptionError";
  }
}

const MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 2000;

export async function transcribeWavFile(
  wavPath: string,
  apiKey: string,
  options: { language?: string; timeoutMs?: number; retryBaseDelayMs?: number } = {}
): Promise<TranscriptionResult> {
  const wavBytes = await readFile(wavPath);
  const baseDelayMs = options.retryBaseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await attemptTranscription(wavBytes, wavPath, apiKey, options);
    } catch (error: unknown) {
      if (!isRetryableError(error) && !(error instanceof Error && error.name === "AbortError")) {
        throw error;
      }
      if (attempt >= MAX_RETRIES - 1) {
        throw error;
      }
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(
        `Transcription retryable error, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES}): ${errorMsg}`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error("Unreachable");
}

async function attemptTranscription(
  wavBytes: Buffer,
  wavPath: string,
  apiKey: string,
  options: { language?: string; timeoutMs?: number }
): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append("file", new Blob([wavBytes], { type: "audio/wav" }), basename(wavPath));
  formData.append("model", TRANSCRIPTION_CONSTANTS.MODEL);
  if (options.language) {
    formData.append("language", options.language);
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(TRANSCRIPTION_CONSTANTS.ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
      },
      body: formData,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new TranscriptionError(`Transcription timed out after ${timeoutMs}ms`);
    }
    throw new TranscriptionError(
      `Transcription request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new TranscriptionError(
      `Transcription API error [${response.status}]${errorText ? `: ${errorText.slice(0, 300)}` : ""}`,
      response.status
    );
  }

  const data = (await response.json()) as { text?: string };
  const text = data.text?.trim() ?? "";
  if (text.length === 0) {
    throw new TranscriptionError("Transcription returned empty text");
  }

  return { text, model: TRANSCRIPTION_CONSTANTS.MODEL };
}
