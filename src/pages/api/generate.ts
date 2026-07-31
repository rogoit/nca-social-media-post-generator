import type { APIRoute } from "astro";
import type { GenerateRequest, GenerateResponse, SocialMediaPlatform } from "../../types/index.js";
import { validateTranscript, validateVideoDuration } from "../../utils/validation.js";
import { GenerationSession } from "../../utils/generation-session.js";
import type { GenerationPlatform } from "../../utils/generation-session.js";
import { jsonResponse } from "../../utils/api-helpers.js";

const MISTRAL_API_KEY = import.meta.env.MISTRAL_API_KEY;

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!MISTRAL_API_KEY) {
      return jsonResponse(
        { error: "AI-Dienste nicht verfügbar. Bitte MISTRAL_API_KEY prüfen." },
        503
      );
    }

    const body = await parseAndValidateRequest(request);
    if ("error" in body) {
      return body.error;
    }

    const { type = "youtube", videoDuration } = body;
    const cleanedResult = cleanTranscript(body.transcript);
    const transcript = cleanedResult.transcript;
    const transcriptCleaned = cleanedResult.cleaned;

    // Request-scoped session — no shared state across requests.
    const session = new GenerationSession(MISTRAL_API_KEY);
    await session.initialize(transcript);

    if (type === "keywords") {
      return jsonResponse({
        keywords: session.keywords,
        transcriptCleaned,
        modelUsed: session.currentModel,
      });
    }

    const result = await session.generatePlatform(type as GenerationPlatform, transcript, {
      videoDuration,
    });

    const responseData: GenerateResponse = {
      ...result.response,
      transcriptCleaned,
      modelUsed: result.modelUsed,
      humanizerWarnings: result.humanizerWarnings,
    };

    return jsonResponse(responseData);
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    console.error("Unerwarteter Fehler:", error);

    if (
      details.includes("All AI providers failed") ||
      details.includes("Chat session") ||
      details.includes("AI-Antwort")
    ) {
      const isValidation = details.includes("AI-Antwort");
      return jsonResponse(
        { error: isValidation ? details : "Inhaltsgenerierung fehlgeschlagen", details },
        isValidation ? 502 : 503
      );
    }

    return jsonResponse({ error: "Unerwarteter Fehler beim Generieren des Inhalts", details }, 500);
  }
};

async function parseAndValidateRequest(
  request: Request
): Promise<GenerateRequest | { error: Response }> {
  let body: GenerateRequest;

  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return {
      error: jsonResponse({ error: "Ungültige JSON-Anfrage" }, 400),
    };
  }

  const transcriptError = validateTranscript(body.transcript);
  if (transcriptError) {
    return {
      error: jsonResponse({ error: transcriptError }, 400),
    };
  }

  const validTypes: SocialMediaPlatform[] = [
    "youtube",
    "linkedin",
    "instagram",
    "tiktok",
    "keywords",
  ];

  if (body.type && !validTypes.includes(body.type)) {
    return {
      error: jsonResponse({ error: "Ungültiger Typ. Erlaubt sind: " + validTypes.join(", ") }, 400),
    };
  }

  if (body.videoDuration) {
    const durationError = validateVideoDuration(body.videoDuration);
    if (durationError) {
      return {
        error: jsonResponse({ error: durationError }, 400),
      };
    }
  }

  return body;
}

function cleanTranscript(transcript: string): { transcript: string; cleaned: boolean } {
  const words = transcript.trim().split(/\s+/);
  if (words.length > 0) {
    const lastWord = words[words.length - 1];
    if (lastWord.length === 1 || /^[A-Za-z]\.$/.test(lastWord)) {
      words.pop();
      console.log("Einzelnes Zeichen/Abkürzung am Ende des Transkripts wurde entfernt.");
      return { transcript: words.join(" "), cleaned: true };
    }
  }
  return { transcript, cleaned: false };
}
