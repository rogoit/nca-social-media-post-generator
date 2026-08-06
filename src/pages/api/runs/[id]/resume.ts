import type { APIRoute } from "astro";
import { GenerationSession } from "../../../../utils/generation-session.js";
import type { GenerationPlatform } from "../../../../utils/generation-session.js";
import { SseStream, sseResponse } from "../../../../utils/sse.js";
import { jsonResponse } from "../../../../utils/api-helpers.js";
import { createTextProvider } from "../../../../utils/ai-providers.js";
import {
  loadRun,
  missingPlatforms,
  persistPlatformResult,
  finishRun,
} from "../../../../utils/persistence.js";

const OLLAMA_API_KEY = import.meta.env.OLLAMA_API_KEY;

const ALL_PLATFORMS: GenerationPlatform[] = ["youtube", "linkedin", "instagram", "tiktok"];

/**
 * SSE endpoint: resume a persisted run. Loads the corrected transcript +
 * chat history from the DB (turn 1 is NOT re-run), then generates only the
 * platforms whose status is not already "ready". Streams the same event
 * contract as /api/generate-all so the frontend reuses one consumer.
 */
export const POST: APIRoute = async ({ params }) => {
  if (!OLLAMA_API_KEY) {
    return jsonResponse({ error: "AI-Dienste nicht verfügbar. Bitte OLLAMA_API_KEY prüfen." }, 503);
  }

  const runId = params.id;
  if (!runId) {
    return jsonResponse({ error: "Run-ID fehlt." }, 400);
  }

  const persisted = await loadRun(runId);
  if (!persisted) {
    return jsonResponse({ error: "Run nicht gefunden." }, 404);
  }
  if (!persisted.chatHistory || !persisted.correctedTranscript) {
    return jsonResponse({ error: "Run hat keinen wiederherstellbaren Chat-Verlauf." }, 409);
  }

  const toGenerate = await missingPlatforms(runId, ALL_PLATFORMS);
  if (toGenerate.length === 0) {
    return jsonResponse({ error: "Run ist bereits vollständig." }, 409);
  }

  // Capture narrowed non-null values before the detached IIFE — TS does not
  // narrow `persisted.chatHistory`/`.correctedTranscript` across the closure.
  const chatHistory = persisted.chatHistory;
  const correctedTranscript = persisted.correctedTranscript;
  const rawTranscript = persisted.rawTranscript ?? correctedTranscript;
  const videoDuration = persisted.videoDuration ?? undefined;
  const runModel = persisted.model ?? "";
  const runKeywords = persisted.keywords ?? [];

  const sse = new SseStream();
  sse.sendRunStarted(persisted.id, persisted.filename);

  (async () => {
    let readyCount = 0;
    try {
      const session = new GenerationSession(createTextProvider(), (event) =>
        sse.emitProgress(event)
      );
      session.restoreFrom({
        chatHistory,
        correctedTranscript,
        keywords: runKeywords,
        model: runModel,
      });

      let lastModel = runModel;
      for (const platform of toGenerate) {
        try {
          const result = await session.generatePlatform(platform, rawTranscript, { videoDuration });
          lastModel = result.modelUsed;
          readyCount++;
          await persistPlatformResult(runId, platform, {
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
          console.error(`Resume: platform ${platform} generation failed:`, platformError);
          await persistPlatformResult(runId, platform, { status: "error", errorMessage: message });
          sse.event("platform_error", { platform, message });
        }
      }

      // Recompute overall status from the full platform set (not just this
      // resume batch): done only when every platform is ready.
      const stillMissing = await missingPlatforms(runId, ALL_PLATFORMS);
      const finalStatus = stillMissing.length === 0 ? "done" : "partial";
      await finishRun(runId, finalStatus);
      sse.sendComplete(lastModel);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("resume pipeline failed:", error);
      await finishRun(runId, "error", message).catch((e) =>
        console.warn("Failed to persist resume error state:", e)
      );
      sse.sendError("pipeline", message);
    } finally {
      sse.close();
    }
  })();

  return sseResponse(sse);
};
