import type { APIRoute } from "astro";
import { validateVideoFile, validateVideoDuration } from "../../utils/validation.js";
import { GoogleGeminiProvider } from "../../utils/ai-providers.js";
import { GenerationSession } from "../../utils/generation-session.js";
import type { GenerationPlatform } from "../../utils/generation-session.js";
import { SseStream, sseResponse } from "../../utils/sse.js";
import { jsonResponse } from "../../utils/api-helpers.js";

const GOOGLE_GEMINI_API_KEY = import.meta.env.GOOGLE_GEMINI_API_KEY;
const MISTRAL_API_KEY = import.meta.env.MISTRAL_API_KEY;

const PLATFORMS: GenerationPlatform[] = ["youtube", "linkedin", "instagram", "tiktok"];

/**
 * SSE endpoint: upload a video, stream the whole pipeline out as events.
 * Turn order: Gemini transcript extraction → Mistral chat (correction +
 * keywords) → per-platform generation. The video Buffer is request-scoped
 * and never written to disk.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!GOOGLE_GEMINI_API_KEY) {
    return jsonResponse(
      { error: "Video-Verarbeitung nicht verfügbar. Bitte GOOGLE_GEMINI_API_KEY prüfen." },
      503
    );
  }
  if (!MISTRAL_API_KEY) {
    return jsonResponse(
      { error: "Text-Generierung nicht verfügbar. Bitte MISTRAL_API_KEY prüfen." },
      503
    );
  }

  // Multipart parsing happens BEFORE the SSE stream starts: request validation
  // errors must still be plain JSON responses.
  const formData = await request.formData();
  const videoFile = formData.get("video") as File | null;
  const videoDurationRaw = formData.get("videoDuration");
  const videoDuration = typeof videoDurationRaw === "string" ? videoDurationRaw : undefined;

  if (!videoFile) {
    return jsonResponse({ error: "Keine Video-Datei gefunden." }, 400);
  }

  const validationError = validateVideoFile({
    name: videoFile.name,
    size: videoFile.size,
    type: videoFile.type,
  });
  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }
  if (videoDuration) {
    const durationError = validateVideoDuration(videoDuration);
    if (durationError) {
      return jsonResponse({ error: durationError }, 400);
    }
  }

  const arrayBuffer = await videoFile.arrayBuffer();
  let videoBuffer: Buffer | null = Buffer.from(arrayBuffer);
  const mimeType = videoFile.type;

  const sse = new SseStream();

  (async () => {
    try {
      // Step 1: Gemini transcript extraction (video buffer discarded right after)
      const gemini = new GoogleGeminiProvider(GOOGLE_GEMINI_API_KEY);
      const { text: rawTranscript, model: transcriptModel } = await gemini.extractTranscript(
        videoBuffer,
        mimeType
      );
      videoBuffer = null;

      sse.event("transcript_extracted", { transcriptModel });

      // Step 2: Mistral chat session — correction + keywords + all platforms
      const session = new GenerationSession(MISTRAL_API_KEY, (event) => sse.emitProgress(event));
      const { correctedTranscript, keywords, model } = await session.initialize(rawTranscript);

      sse.event("transcript_done", { transcript: correctedTranscript, keywords, modelUsed: model });

      let lastModel = model;
      for (const platform of PLATFORMS) {
        try {
          const result = await session.generatePlatform(platform, rawTranscript, {
            videoDuration,
          });
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
      console.error("generate-from-video pipeline failed:", error);
      sse.sendError("pipeline", message);
    } finally {
      sse.close();
    }
  })();

  return sseResponse(sse);
};
