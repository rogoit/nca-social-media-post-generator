import type { APIRoute } from "astro";
import type { GenerateRequest, GenerateResponse, SocialMediaPlatform } from "../../types/index.js";
import { validateTranscript, validateVideoDuration } from "../../utils/validation.js";
import { MistralProvider } from "../../utils/ai-providers.js";
import { ChatPrompts } from "../../config/chat-prompts.js";
import { ResponseParser } from "../../utils/response-parser.js";
import { AI_MODELS } from "../../config/constants.js";
import {
  TRANSCRIPT_RESPONSE_FORMAT,
  getYoutubeResponseFormat,
  LINKEDIN_RESPONSE_FORMAT,
  TWITTER_RESPONSE_FORMAT,
  INSTAGRAM_RESPONSE_FORMAT,
  TIKTOK_RESPONSE_FORMAT,
} from "../../config/schemas.js";
import { jsonResponse } from "../../utils/api-helpers.js";

const MISTRAL_API_KEY = import.meta.env.MISTRAL_API_KEY;

let mistralProvider: MistralProvider;

// Chat session state: persists across requests for the same transcript
let chatTranscript: string | null = null;
let chatCorrectedTranscript: string | null = null;
let chatKeywords: string[] = [];
let chatModel: string = "";

try {
  if (MISTRAL_API_KEY) {
    mistralProvider = new MistralProvider(MISTRAL_API_KEY);
  }
} catch (error) {
  console.error("Failed to initialize AI providers:", error);
}

async function initializeChatSession(transcript: string): Promise<void> {
  const initialMessage = ChatPrompts.createInitialMessage(transcript);
  const { text: initialText, model } = await mistralProvider.sendChatMessage(
    initialMessage,
    TRANSCRIPT_RESPONSE_FORMAT
  );

  const transcriptResult = ResponseParser.parseResponse("youtube", initialText);
  const keywordResult = ResponseParser.parseResponse("keywords", initialText);

  chatTranscript = transcript;
  chatCorrectedTranscript = transcriptResult.transcript || transcript;
  chatKeywords = keywordResult.keywords || [];
  chatModel = model;
}

async function ensureChatSession(transcript: string): Promise<void> {
  if (chatTranscript === transcript && chatCorrectedTranscript) {
    return;
  }

  mistralProvider.startChatSession();
  await initializeChatSession(transcript);
}

async function restartChatOnFallbackModel(transcript: string): Promise<boolean> {
  const currentModelIndex = AI_MODELS.mistral.indexOf(chatModel);
  const nextModel = AI_MODELS.mistral[currentModelIndex + 1];

  if (!nextModel) {
    return false;
  }

  console.warn(`Restarting chat session on fallback model: ${nextModel}`);

  chatTranscript = null;
  chatCorrectedTranscript = null;

  mistralProvider.startChatSessionWithModel(nextModel);
  await initializeChatSession(transcript);

  return true;
}

const PLATFORM_RESPONSE_FORMATS = {
  linkedin: LINKEDIN_RESPONSE_FORMAT,
  twitter: TWITTER_RESPONSE_FORMAT,
  instagram: INSTAGRAM_RESPONSE_FORMAT,
  tiktok: TIKTOK_RESPONSE_FORMAT,
} as const;

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!mistralProvider) {
      return jsonResponse(
        { error: "AI-Dienste nicht verfügbar. Bitte MISTRAL_API_KEY prüfen." },
        503
      );
    }

    // Parse and validate request
    const body = await parseAndValidateRequest(request);
    if ("error" in body) {
      return body.error;
    }

    const { type = "youtube", videoDuration } = body;
    let { transcript } = body;
    let transcriptCleaned = false;

    // Clean transcript: Remove single characters at the end
    const cleanedResult = cleanTranscript(transcript);
    transcript = cleanedResult.transcript;
    transcriptCleaned = cleanedResult.cleaned;

    // For keywords type: initialize chat session and return corrected keywords
    if (type === "keywords") {
      await ensureChatSession(transcript);
      return jsonResponse({
        keywords: chatKeywords,
        transcriptCleaned,
        modelUsed: chatModel,
      });
    }

    // For platform types: ensure chat session exists, then generate via chat
    await ensureChatSession(transcript);

    const platformMessage = ChatPrompts.createPlatformMessage(
      type as "youtube" | "linkedin" | "twitter" | "instagram" | "tiktok",
      { videoDuration }
    );
    const platformResponseFormat =
      type === "youtube"
        ? getYoutubeResponseFormat(videoDuration)
        : PLATFORM_RESPONSE_FORMATS[type as keyof typeof PLATFORM_RESPONSE_FORMATS];

    let text: string;
    let model: string;
    try {
      const result = await mistralProvider.sendChatMessage(platformMessage, platformResponseFormat);
      text = result.text;
      model = result.model;
    } catch (error: any) {
      // If retries exhausted, try fallback model with fresh session
      const is503or429 =
        error.message && /\[503\s|\[429\s|Resource has been exhausted/i.test(error.message);
      if (is503or429 && (await restartChatOnFallbackModel(transcript))) {
        console.warn(`Retrying platform ${type} on fallback model ${chatModel}`);
        const result = await mistralProvider.sendChatMessage(
          platformMessage,
          platformResponseFormat
        );
        text = result.text;
        model = result.model;
      } else {
        throw error;
      }
    }

    // Parse the response based on platform
    const parsedResponse = ResponseParser.parseResponse(type, text);

    // Validate that the response contains meaningful content
    const validationError = ResponseParser.validateResponse(type, parsedResponse);
    if (validationError) {
      return jsonResponse(
        { error: "AI-Antwort enthält keine gültigen Inhalte", details: validationError },
        502
      );
    }

    // For YouTube: use the corrected transcript from the chat session
    if (type === "youtube") {
      parsedResponse.transcript = chatCorrectedTranscript || undefined;
    }

    // Create final response
    const responseData: GenerateResponse = {
      ...parsedResponse,
      transcriptCleaned,
      modelUsed: model,
    };

    return jsonResponse(responseData);
  } catch (error: any) {
    console.error("Unerwarteter Fehler:", error);

    if (
      error.message?.includes("All AI providers failed") ||
      error.message?.includes("Chat session")
    ) {
      return jsonResponse(
        { error: "Inhaltsgenerierung fehlgeschlagen", details: error.message },
        503
      );
    }

    return jsonResponse(
      { error: "Unerwarteter Fehler beim Generieren des Inhalts", details: error.message },
      500
    );
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
    "twitter",
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
      const cleanedTranscript = words.join(" ");
      console.log("Einzelnes Zeichen/Abkürzung am Ende des Transkripts wurde entfernt.");
      return { transcript: cleanedTranscript, cleaned: true };
    }
  }
  return { transcript, cleaned: false };
}
