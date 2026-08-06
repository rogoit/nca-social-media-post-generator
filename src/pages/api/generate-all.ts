import type { APIRoute } from "astro";
import { validateTranscript, validateVideoDuration } from "../../utils/validation.js";
import { GenerationSession } from "../../utils/generation-session.js";
import type { GenerationPlatform } from "../../utils/generation-session.js";
import { SseStream, sseResponse } from "../../utils/sse.js";
import { jsonResponse } from "../../utils/api-helpers.js";
import { createTextProvider } from "../../utils/ai-providers.js";
import {
  startRun,
  persistTurn1,
  persistPlatformResult,
  finishRun,
} from "../../utils/persistence.js";

const OLLAMA_API_KEY = import.meta.env.OLLAMA_API_KEY;

const PLATFORMS: GenerationPlatform[] = ["youtube", "linkedin", "instagram", "tiktok"];

/**
 * SSE endpoint: generates all platforms in one chat session and streams
 * progress events. Used by both the caption flow (after keyword confirm)
 * and any client that wants progressive per-platform results. Persisted to
 * SQLite keyed by a synthetic caption filename so a refresh/SSE-drop resumes
 * from the last save-point without re-running turn 1.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!OLLAMA_API_KEY) {
    return jsonResponse({ error: "AI-Dienste nicht verfügbar. Bitte OLLAMA_API_KEY prüfen." }, 503);
  }

  let body: { transcript?: string; videoDuration?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Ungültige JSON-Anfrage" }, 400);
  }

  const transcriptError = validateTranscript(body.transcript ?? "");
  if (transcriptError) {
    return jsonResponse({ error: transcriptError }, 400);
  }
  if (body.videoDuration) {
    const durationError = validateVideoDuration(body.videoDuration);
    if (durationError) {
      return jsonResponse({ error: durationError }, 400);
    }
  }

  const transcript = body.transcript!;
  const videoDuration = body.videoDuration;

  // Synthetic filename for the caption flow: a short hash of the transcript
  // keeps it readable while disambiguating from video uploads.
  const filename = `caption-${transcript.slice(0, 24).replace(/\s+/g, "_")}.txt`;
  const run = await startRun({
    filename,
    inputSource: "caption",
    videoDuration,
  });

  const sse = new SseStream();
  sse.sendRunStarted(run.id, run.filename);

  // Pipeline runs detached; the response streams out events as they happen.
  (async () => {
    let readyCount = 0;
    try {
      const session = new GenerationSession(createTextProvider(), (event) =>
        sse.emitProgress(event)
      );
      const { correctedTranscript, keywords, model } = await session.initialize(transcript);

      await persistTurn1(run.id, {
        rawTranscript: transcript,
        correctedTranscript,
        keywords,
        chatHistory: session.serializeChatHistory(),
        model,
      });

      sse.event("transcript_done", { transcript: correctedTranscript, keywords, modelUsed: model });

      let lastModel = model;
      for (const platform of PLATFORMS) {
        try {
          const result = await session.generatePlatform(platform, transcript, { videoDuration });
          lastModel = result.modelUsed;
          readyCount++;
          await persistPlatformResult(run.id, platform, {
            status: "ready",
            content: result.response as Record<string, unknown>,
            model: result.modelUsed,
            humanizerWarnings: result.humanizerWarnings,
          });
          sse.sendPlatformDone(
            platform,
            result.response,
            result.modelUsed,
            result.humanizerWarnings
          );
        } catch (platformError: unknown) {
          const message =
            platformError instanceof Error ? platformError.message : String(platformError);
          console.error(`Platform ${platform} generation failed:`, platformError);
          await persistPlatformResult(run.id, platform, { status: "error", errorMessage: message });
          sse.event("platform_error", { platform, message });
        }
      }

      await finishRun(run.id, readyCount === PLATFORMS.length ? "done" : "partial");
      sse.sendComplete(lastModel);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("generate-all pipeline failed:", error);
      await finishRun(run.id, "error", message).catch((e) =>
        console.warn("Failed to persist run error state:", e)
      );
      sse.sendError("pipeline", message);
    } finally {
      sse.close();
    }
  })();

  return sseResponse(sse);
};
