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
  /** Server-generated run id, persisted to localStorage so a refresh can
   * rehydrate this store from the DB. Null until the first SSE run_started. */
  runId: string | null;
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
  runId: null,
});

export const generationStore = map<GenerationState>(initialState());

const RUN_ID_STORAGE_KEY = "nca-run-id";

function persistRunId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(RUN_ID_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(RUN_ID_STORAGE_KEY);
    }
  } catch {
    // localStorage may be unavailable (private mode / SSR) — non-fatal.
  }
}

function readPersistedRunId(): string | null {
  try {
    return localStorage.getItem(RUN_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function reset() {
  persistRunId(null);
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
    case "run_started":
      generationStore.setKey("runId", data.runId ?? null);
      persistRunId(data.runId ?? null);
      break;
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

/** Single-platform retry from an errored card. Uses /api/generate (JSON).
 * Sends the persisted runId so the server restores the chat history and does
 * NOT re-run turn 1. */
export async function retryPlatform(platform: PlatformKey) {
  const transcript =
    generationStore.get().correctedTranscript ?? generationStore.get().rawTranscript;
  if (!transcript) return;
  setPlatform(platform, { status: "pending", errorMessage: null });
  try {
    const runId = generationStore.get().runId;
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, type: platform, runId: runId ?? undefined }),
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

/** Shape returned by GET /api/runs/:id and /api/runs/latest. */
interface PersistedRunPayload {
  id: string;
  filename: string;
  inputSource: "caption" | "video";
  status: string;
  rawTranscript: string | null;
  correctedTranscript: string | null;
  keywords: string[] | null;
  model: string | null;
  videoDuration: string | null;
  errorMessage: string | null;
  platformResults: Array<{
    platform: PlatformKey;
    status: "pending" | "ready" | "error";
    content: Record<string, unknown> | null;
    model: string | null;
    humanizerWarnings: string[] | null;
    errorMessage: string | null;
  }>;
}

/** Populate the store from a persisted run (refresh / SSE-drop recovery). */
export function hydrateRun(run: PersistedRunPayload): void {
  const platforms = {
    youtube: emptyPlatform(),
    linkedin: emptyPlatform(),
    instagram: emptyPlatform(),
    tiktok: emptyPlatform(),
  };
  let readyCount = 0;
  for (const pr of run.platformResults) {
    if (pr.status === "ready") readyCount++;
    platforms[pr.platform] = {
      status: pr.status,
      content: pr.content,
      modelUsed: pr.model,
      humanizerWarnings: pr.humanizerWarnings,
      errorMessage: pr.errorMessage,
    };
  }

  // If every platform is ready, the run is effectively done even if the
  // server status is still "running" (e.g. SSE dropped right at the end).
  const isDone = readyCount === 4;
  generationStore.set({
    stage: isDone ? "done" : run.status === "error" ? "error" : "generating",
    inputSource: run.inputSource,
    rawTranscript: run.rawTranscript ?? "",
    correctedTranscript: run.correctedTranscript,
    keywords: run.keywords ?? [],
    transcriptCleaned: false,
    modelUsed: run.model,
    errorMessage: run.status === "error" ? run.errorMessage : null,
    platforms,
    runId: run.id,
  });
  persistRunId(run.id);
}

const ALL_PLATFORMS: PlatformKey[] = ["youtube", "linkedin", "instagram", "tiktok"];

/**
 * Resume a persisted run: regenerate only the missing platforms via SSE.
 * Preserves already-ready cards (only the missing ones are marked queued).
 * A 409 ("nothing to resume") is treated as success, not an error.
 */
export async function resumeRun(runId: string, missing: PlatformKey[]): Promise<void> {
  if (missing.length === 0) return;

  // Mark only the missing platforms queued; keep ready cards as they are.
  generationStore.setKey("stage", "generating");
  generationStore.setKey("errorMessage", null);
  for (const p of missing) {
    setPlatform(p, { status: "queued", errorMessage: null });
  }

  try {
    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/resume`, {
      method: "POST",
    });
    // 409 = run already complete / no restorable history — nothing to do.
    if (response.status === 409) return;
    await consumeSseStream(response);
  } catch (error) {
    // Stream-level failure: mark the still-missing platforms as error so the
    // finished cards stay visible and each missing card offers a retry.
    const message = error instanceof Error ? error.message : "Fortsetzen fehlgeschlagen.";
    for (const p of missing) {
      const current = generationStore.get().platforms[p];
      if (current.status !== "ready") {
        setPlatform(p, { status: "error", errorMessage: message });
      }
    }
  }
}

/**
 * On load: rehydrate the most recent persisted run so finished work reappears
 * immediately, and silently resume any missing platforms. No banner, no click
 * — a refresh just continues where it left off.
 */
export async function loadPersistedRunOnMount(): Promise<void> {
  // If a generation is already in flight, don't clobber it.
  const current = generationStore.get();
  if (current.stage === "generating" || current.stage === "keywords") return;

  const persistedId = readPersistedRunId();
  const candidates = persistedId
    ? [`/api/runs/${encodeURIComponent(persistedId)}`, "/api/runs/latest"]
    : ["/api/runs/latest"];

  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const run = (await response.json()) as PersistedRunPayload;
      // Nothing useful to show without a corrected transcript (run failed
      // before turn 1 finished).
      if (!run.correctedTranscript) continue;

      hydrateRun(run);

      const missing = ALL_PLATFORMS.filter((p) => {
        const pr = run.platformResults.find((r) => r.platform === p);
        return !pr || pr.status !== "ready";
      });
      if (missing.length > 0) {
        await resumeRun(run.id, missing);
      }
      return;
    } catch {
      continue;
    }
  }
}
