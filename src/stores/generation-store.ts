import { map } from "nanostores";

export type PlatformKey = "youtube" | "linkedin" | "instagram" | "tiktok";
export type PlatformStatus = "idle" | "queued" | "pending" | "humanizer" | "ready" | "error";
export type Stage = "idle" | "keywords" | "generating" | "done" | "error";

export interface PlatformState {
  status: PlatformStatus;
  content: Record<string, unknown> | null;
  modelUsed: string | null;
  humanizerWarnings: string[] | null;
  errorMessage: string | null;
}

export interface GenerationState {
  stage: Stage;
  /** "caption" = pasted text flow (desktop), "video" = upload flow (phone) */
  inputSource: "caption" | "video" | null;
  /** Raw user input (caption text). Held for regeneration/retry calls. */
  rawTranscript: string;
  correctedTranscript: string | null;
  keywords: string[];
  transcriptCleaned: boolean;
  modelUsed: string | null;
  errorMessage: string | null;
  platforms: Record<PlatformKey, PlatformState>;
}

const emptyPlatform = (): PlatformState => ({
  status: "idle",
  content: null,
  modelUsed: null,
  humanizerWarnings: null,
  errorMessage: null,
});

const initialState = (): GenerationState => ({
  stage: "idle",
  inputSource: null,
  rawTranscript: "",
  correctedTranscript: null,
  keywords: [],
  transcriptCleaned: false,
  modelUsed: null,
  errorMessage: null,
  platforms: {
    youtube: emptyPlatform(),
    linkedin: emptyPlatform(),
    instagram: emptyPlatform(),
    tiktok: emptyPlatform(),
  },
});

export const generationStore = map<GenerationState>(initialState());

export function reset() {
  generationStore.set(initialState());
}

/** Keyword stage (caption flow): AI detected keywords, waiting for user confirm. */
export function enterKeywordStage(keywords: string[], source: "caption" | "video") {
  generationStore.setKey("stage", "keywords");
  generationStore.setKey("keywords", keywords);
  generationStore.setKey("inputSource", source);
  generationStore.setKey("errorMessage", null);
}

export function beginGenerating() {
  const s = generationStore.get();
  generationStore.set({
    ...s,
    stage: "generating",
    errorMessage: null,
    platforms: {
      youtube: { ...emptyPlatform(), status: "queued" },
      linkedin: { ...emptyPlatform(), status: "queued" },
      instagram: { ...emptyPlatform(), status: "queued" },
      tiktok: { ...emptyPlatform(), status: "queued" },
    },
  });
}

function setPlatform(key: PlatformKey, partial: Partial<PlatformState>) {
  const s = generationStore.get();
  generationStore.setKey("platforms", {
    ...s.platforms,
    [key]: { ...s.platforms[key], ...partial },
  });
}

/**
 * Fetch + ReadableStream SSE consumer. The server emits `event:` lines;
 * we parse the wire format and update the store per event type.
 * Exported per-event handler so it is unit-testable without a network.
 */
export function handleSseEvent(eventName: string, data: any): void {
  switch (eventName) {
    case "transcript_done":
      generationStore.setKey("correctedTranscript", data.transcript ?? null);
      generationStore.setKey("keywords", data.keywords ?? []);
      generationStore.setKey("modelUsed", data.modelUsed ?? null);
      break;
    case "platform_started":
      setPlatform(data.platform as PlatformKey, { status: "pending" });
      break;
    case "humanizer_retry":
      setPlatform(data.platform as PlatformKey, { status: "humanizer" });
      break;
    case "platform_done":
      setPlatform(data.platform as PlatformKey, {
        status: "ready",
        content: data.content ?? null,
        modelUsed: data.modelUsed ?? null,
        humanizerWarnings:
          Array.isArray(data.humanizerWarnings) && data.humanizerWarnings.length > 0
            ? data.humanizerWarnings
            : null,
      });
      break;
    case "platform_error":
      setPlatform(data.platform as PlatformKey, {
        status: "error",
        errorMessage: data.message ?? "Unbekannter Fehler",
      });
      break;
    case "model_fallback":
      generationStore.setKey("modelUsed", data.model ?? null);
      break;
    case "complete":
      generationStore.setKey("stage", "done");
      if (data.modelUsed) generationStore.setKey("modelUsed", data.modelUsed);
      break;
    case "error":
      generationStore.setKey("stage", "error");
      generationStore.setKey("errorMessage", data.message ?? "Unbekannter Fehler");
      break;
  }
}

export async function consumeSseStream(response: Response): Promise<void> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Server-Fehler (${response.status})`);
  }
  if (!response.body) throw new Error("Kein Stream vom Server erhalten.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const rawBlock = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const eventLine = rawBlock.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = rawBlock.split("\n").find((l) => l.startsWith("data: "));
      if (eventLine && dataLine) {
        const name = eventLine.slice(7).trim();
        try {
          handleSseEvent(name, JSON.parse(dataLine.slice(6)));
        } catch (parseError) {
          console.warn("SSE event JSON parse failed:", parseError, dataLine);
        }
      }
    }
  }
}

async function postJson(url: string, body: object): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await consumeSseStream(response);
}

/** Step 1 of caption flow: detect keywords via /api/generate (JSON, not SSE). */
export async function detectKeywords(transcript: string): Promise<void> {
  generationStore.setKey("rawTranscript", transcript);
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, type: "keywords" }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Keyword-Erkennung fehlgeschlagen.");
  }
  enterKeywordStage((data as { keywords?: string[] }).keywords ?? [], "caption");
}

/** Caption flow confirm: user approved/edited keywords, start all platforms. */
export async function startCaptionGeneration(videoDuration?: string) {
  const transcript = generationStore.get().rawTranscript;
  if (!transcript.trim()) {
    generationStore.setKey("stage", "error");
    generationStore.setKey("errorMessage", "Kein Transkript vorhanden.");
    return;
  }
  beginGenerating();
  generationStore.setKey("inputSource", "caption");
  try {
    await postJson("/api/generate-all", {
      transcript,
      videoDuration: videoDuration?.trim() || undefined,
    });
  } catch (error) {
    generationStore.setKey("stage", "error");
    generationStore.setKey(
      "errorMessage",
      error instanceof Error ? error.message : "Generierung fehlgeschlagen."
    );
  }
}

/** Video flow: upload file, pipeline starts immediately (no keyword stage). */
export async function startVideoGeneration(file: File, videoDuration?: string) {
  beginGenerating();
  generationStore.setKey("inputSource", "video");
  const formData = new FormData();
  formData.append("video", file);
  if (videoDuration?.trim()) formData.append("videoDuration", videoDuration.trim());
  try {
    const response = await fetch("/api/generate-from-video", {
      method: "POST",
      body: formData,
    });
    await consumeSseStream(response);
  } catch (error) {
    generationStore.setKey("stage", "error");
    generationStore.setKey(
      "errorMessage",
      error instanceof Error ? error.message : "Video-Verarbeitung fehlgeschlagen."
    );
  }
}

/** Single-platform retry from an errored card. Uses /api/generate (JSON). */
export async function retryPlatform(platform: PlatformKey) {
  const transcript =
    generationStore.get().correctedTranscript ?? generationStore.get().rawTranscript;
  if (!transcript) return;
  setPlatform(platform, { status: "pending", errorMessage: null });
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, type: platform }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || "Erneute Generierung fehlgeschlagen.");
    }
    const typed = data as {
      modelUsed?: string;
      humanizerWarnings?: string[];
    } & Record<string, unknown>;
    setPlatform(platform, {
      status: "ready",
      content: typed,
      modelUsed: typed.modelUsed ?? null,
      humanizerWarnings: typed.humanizerWarnings?.length ? typed.humanizerWarnings : null,
    });
  } catch (error) {
    setPlatform(platform, {
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Erneute Generierung fehlgeschlagen.",
    });
  }
}
