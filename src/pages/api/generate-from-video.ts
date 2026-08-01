import type { APIRoute } from "astro";
import { validateVideoFile, validateVideoDuration } from "../../utils/validation.js";
import { extractAudioToWav, cleanupWorkDir } from "../../utils/audio-extraction.js";
import { transcribeWavFile } from "../../utils/transcriber.js";
import { GenerationSession } from "../../utils/generation-session.js";
import type { GenerationPlatform } from "../../utils/generation-session.js";
import { SseStream, sseResponse } from "../../utils/sse.js";
import { jsonResponse } from "../../utils/api-helpers.js";

const MISTRAL_API_KEY = import.meta.env.MISTRAL_API_KEY;

const PLATFORMS: GenerationPlatform[] = ["youtube", "linkedin", "instagram", "tiktok"];

/**
 * SSE endpoint: upload a video, stream the whole pipeline out as events.
 * Pipeline: video → ffmpeg audio WAV → Mistral Voxtral transcription →
 * Mistral chat session (correction, keywords, per-platform content).
 * The video Buffer and the temp WAV are request-scoped; the temp dir is
 * removed once transcription returns. Nothing is persisted server-side.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!MISTRAL_API_KEY) {
    return jsonResponse(
      { error: "Verarbeitung nicht verfügbar. Bitte MISTRAL_API_KEY prüfen." },
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
  const videoBuffer: Buffer = Buffer.from(arrayBuffer);
  const inputSuffix = (() => {
    const name = videoFile.name?.toLowerCase() ?? "";
    if (name.endsWith(".webm")) return ".webm";
    if (name.endsWith(".mov")) return ".mov";
    return ".mp4";
  })();

  const sse = new SseStream();

  (async () => {
    let workDir: string | null = null;
    try {
      // Step 1: video bytes → audio WAV (ffmpeg, temp dir, discarded after)
      sse.event("extraction_started", {});
      const { wavPath, workDir: dir } = await extractAudioToWav(videoBuffer, inputSuffix);
      workDir = dir;

      // Step 2: WAV → raw transcript via Mistral Voxtral
      const { text: rawTranscript, model: transcriptModel } = await transcribeWavFile(
        wavPath,
        MISTRAL_API_KEY,
        { language: "de" }
      );
      sse.event("transcript_extracted", { transcriptModel });

      // Temp dir cleanup can already happen at this point
      await cleanupWorkDir(workDir);
      workDir = null;

      // Step 3: Mistral chat session — correction + keywords + all platforms
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
      if (workDir) {
        await cleanupWorkDir(workDir).catch((cleanupErr) =>
          console.warn("Failed to clean up temp dir:", cleanupErr)
        );
      }
      sse.close();
    }
  })();

  return sseResponse(sse);
};
