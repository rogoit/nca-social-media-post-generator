import type { APIRoute } from "astro";
import { validateTranscript, validateVideoDuration } from "../../utils/validation.js";
import { GenerationSession } from "../../utils/generation-session.js";
import type { GenerationPlatform } from "../../utils/generation-session.js";
import { SseStream, sseResponse } from "../../utils/sse.js";
import { jsonResponse } from "../../utils/api-helpers.js";

const MISTRAL_API_KEY = import.meta.env.MISTRAL_API_KEY;

const PLATFORMS: GenerationPlatform[] = ["youtube", "linkedin", "instagram", "tiktok"];

/**
 * SSE endpoint: generates all platforms in one chat session and streams
 * progress events. Used by both the caption flow (after keyword confirm)
 * and any client that wants progressive per-platform results.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!MISTRAL_API_KEY) {
    return jsonResponse(
      { error: "AI-Dienste nicht verfügbar. Bitte MISTRAL_API_KEY prüfen." },
      503
    );
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

  const sse = new SseStream();

  // Pipeline runs detached; the response streams out events as they happen.
  (async () => {
    try {
      const session = new GenerationSession(MISTRAL_API_KEY, (event) => sse.emitProgress(event));
      const { correctedTranscript, keywords, model } = await session.initialize(transcript);

      sse.event("transcript_done", { transcript: correctedTranscript, keywords, modelUsed: model });

      let lastModel = model;
      for (const platform of PLATFORMS) {
        try {
          const result = await session.generatePlatform(platform, transcript, { videoDuration });
          lastModel = result.modelUsed;
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
          sse.event("platform_error", { platform, message });
        }
      }

      sse.sendComplete(lastModel);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("generate-all pipeline failed:", error);
      sse.sendError("pipeline", message);
    } finally {
      sse.close();
    }
  })();

  return sseResponse(sse);
};
