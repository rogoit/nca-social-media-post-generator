import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { TRANSCRIPTION_CONSTANTS } from "../config/constants.js";

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

export async function transcribeWavFile(
  wavPath: string,
  apiKey: string,
  options: { language?: string; timeoutMs?: number } = {}
): Promise<TranscriptionResult> {
  const wavBytes = await readFile(wavPath);

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
        // Voxtral uses x-api-key, not Bearer — verify before assuming parity with /chat
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
