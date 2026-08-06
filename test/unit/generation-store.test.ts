import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  generationStore,
  reset,
  beginGenerating,
  handleSseEvent,
  enterKeywordStage,
  hydrateRun,
  resumeRun,
  loadPersistedRunOnMount,
} from "../../src/stores/generation-store.js";

describe("generation-store", () => {
  beforeEach(() => {
    reset();
  });

  it("starts idle with all platforms idle", () => {
    const s = generationStore.get();
    expect(s.stage).toBe("idle");
    expect(s.platforms.youtube.status).toBe("idle");
    expect(s.platforms.tiktok.status).toBe("idle");
  });

  it("enterKeywordStage sets stage+keywords for caption flow", () => {
    enterKeywordStage(["A", "B"], "caption");
    const s = generationStore.get();
    expect(s.stage).toBe("keywords");
    expect(s.keywords).toEqual(["A", "B"]);
    expect(s.inputSource).toBe("caption");
  });

  it("beginGenerating marks all platforms queued, not pending", () => {
    beginGenerating();
    const s = generationStore.get();
    expect(s.stage).toBe("generating");
    expect(s.platforms.youtube.status).toBe("queued");
    expect(s.platforms.linkedin.status).toBe("queued");
    expect(s.platforms.instagram.status).toBe("queued");
    expect(s.platforms.tiktok.status).toBe("queued");
  });

  it("platform_started flips only the active platform from queued to pending", () => {
    beginGenerating();
    expect(generationStore.get().platforms.youtube.status).toBe("queued");
    expect(generationStore.get().platforms.linkedin.status).toBe("queued");

    handleSseEvent("platform_started", { platform: "youtube" });
    expect(generationStore.get().platforms.youtube.status).toBe("pending");
    expect(generationStore.get().platforms.linkedin.status).toBe("queued");
  });

  it("handles the full SSE event sequence", () => {
    beginGenerating();

    handleSseEvent("transcript_done", {
      transcript: "Korrigiert.",
      keywords: ["A", "B"],
      modelUsed: "mistral-large-latest",
    });
    expect(generationStore.get().correctedTranscript).toBe("Korrigiert.");
    expect(generationStore.get().keywords).toEqual(["A", "B"]);
    expect(generationStore.get().modelUsed).toBe("mistral-large-latest");

    handleSseEvent("platform_started", { platform: "youtube" });
    expect(generationStore.get().platforms.youtube.status).toBe("pending");

    handleSseEvent("humanizer_retry", { platform: "youtube" });
    expect(generationStore.get().platforms.youtube.status).toBe("humanizer");

    handleSseEvent("platform_done", {
      platform: "youtube",
      content: { title: "T", description: "D" },
      modelUsed: "mistral-large-latest",
      humanizerWarnings: ["Revolutionär"],
    });
    const yt = generationStore.get().platforms.youtube;
    expect(yt.status).toBe("ready");
    expect(yt.content?.title).toBe("T");
    expect(yt.humanizerWarnings).toEqual(["Revolutionär"]);

    handleSseEvent("platform_error", { platform: "linkedin", message: "kaputt" });
    expect(generationStore.get().platforms.linkedin.status).toBe("error");
    expect(generationStore.get().platforms.linkedin.errorMessage).toBe("kaputt");

    handleSseEvent("complete", { modelUsed: "mistral-large-latest" });
    expect(generationStore.get().stage).toBe("done");
  });

  it("pipeline error moves stage to error with message", () => {
    beginGenerating();
    handleSseEvent("error", { stage: "pipeline", message: "503 rate limit" });
    expect(generationStore.get().stage).toBe("error");
    expect(generationStore.get().errorMessage).toBe("503 rate limit");
  });

  it("reset restores initial state", () => {
    beginGenerating();
    handleSseEvent("complete", {});
    reset();
    const s = generationStore.get();
    expect(s.stage).toBe("idle");
    expect(s.correctedTranscript).toBeNull();
  });

  it("run_started stores the runId on the generation state", () => {
    beginGenerating();
    handleSseEvent("run_started", { runId: "abc-123", filename: "v.mp4" });
    expect(generationStore.get().runId).toBe("abc-123");
  });

  it("hydrateRun rebuilds the store from a persisted run payload", () => {
    hydrateRun({
      id: "r1",
      filename: "v.mp4",
      inputSource: "video",
      status: "partial",
      rawTranscript: "raw",
      correctedTranscript: "korrigiert",
      keywords: ["a", "b"],
      model: "mistral-large-latest",
      videoDuration: null,
      errorMessage: null,
      platformResults: [
        {
          platform: "youtube",
          status: "ready",
          content: { title: "T", description: "D" },
          model: "mistral-large-latest",
          humanizerWarnings: null,
          errorMessage: null,
        },
        {
          platform: "linkedin",
          status: "error",
          content: null,
          model: null,
          humanizerWarnings: null,
          errorMessage: "boom",
        },
      ],
    });

    const s = generationStore.get();
    expect(s.runId).toBe("r1");
    expect(s.correctedTranscript).toBe("korrigiert");
    expect(s.keywords).toEqual(["a", "b"]);
    expect(s.stage).toBe("generating"); // partial → still generating
    expect(s.platforms.youtube.status).toBe("ready");
    expect(s.platforms.youtube.content?.title).toBe("T");
    expect(s.platforms.linkedin.status).toBe("error");
    expect(s.platforms.linkedin.errorMessage).toBe("boom");
    expect(s.platforms.instagram.status).toBe("idle"); // untouched
  });

  it("hydrateRun marks stage done when all four platforms are ready", () => {
    hydrateRun({
      id: "r2",
      filename: "c.txt",
      inputSource: "caption",
      status: "running",
      rawTranscript: "raw",
      correctedTranscript: "k",
      keywords: [],
      model: "m",
      videoDuration: null,
      errorMessage: null,
      platformResults: (["youtube", "linkedin", "instagram", "tiktok"] as const).map((p) => ({
        platform: p,
        status: "ready" as const,
        content: { x: 1 },
        model: "m",
        humanizerWarnings: null,
        errorMessage: null,
      })),
    });
    expect(generationStore.get().stage).toBe("done");
  });
});

// ---- reload / resume behavior (auto-hydrate + silent auto-resume) ----

function sseResponse(events: Array<{ event: string; data: any }>): Response {
  const body = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function jsonOk(data: any): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("loadPersistedRunOnMount", () => {
  const mockFetch = vi.fn() as any;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    reset();
    localStorage.clear();
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  function runPayload(opts: {
    id?: string;
    status?: string;
    platformResults?: Array<{ platform: string; status: string; content?: any }>;
  }) {
    return {
      id: opts.id ?? "r1",
      filename: "v.mp4",
      inputSource: "video" as const,
      status: opts.status ?? "done",
      rawTranscript: "raw",
      correctedTranscript: "korrigiert",
      keywords: ["a"],
      model: "m",
      videoDuration: null,
      errorMessage: null,
      platformResults: opts.platformResults ?? [],
    };
  }

  it("auto-hydrates a completed run and does NOT call resume", async () => {
    mockFetch.mockImplementationOnce(async () =>
      jsonOk(
        runPayload({
          status: "done",
          platformResults: (["youtube", "linkedin", "instagram", "tiktok"] as const).map((p) => ({
            platform: p,
            status: "ready",
            content: { x: 1 },
          })),
        })
      )
    );

    await loadPersistedRunOnMount();

    const s = generationStore.get();
    expect(s.stage).toBe("done");
    expect(s.runId).toBe("r1");
    expect(s.platforms.youtube.status).toBe("ready");
    expect(s.correctedTranscript).toBe("korrigiert");
    // Only the GET /api/runs/latest call — no resume POST.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/runs/latest");
  });

  it("auto-hydrates a partial run and silently resumes missing platforms", async () => {
    // 1st fetch: /api/runs/latest → partial run (youtube ready, others missing)
    mockFetch.mockImplementationOnce(async () =>
      jsonOk(
        runPayload({
          status: "partial",
          platformResults: [{ platform: "youtube", status: "ready", content: { title: "T" } }],
        })
      )
    );
    // 2nd fetch: /api/runs/r1/resume → SSE with platform_done for the 3 missing
    mockFetch.mockImplementationOnce(async () =>
      sseResponse([
        { event: "run_started", data: { runId: "r1", filename: "v.mp4" } },
        { event: "platform_started", data: { platform: "linkedin" } },
        {
          event: "platform_done",
          data: { platform: "linkedin", content: { linkedinPost: "p" }, modelUsed: "m" },
        },
        { event: "platform_started", data: { platform: "instagram" } },
        {
          event: "platform_done",
          data: { platform: "instagram", content: { instagramPost: "i" }, modelUsed: "m" },
        },
        { event: "platform_started", data: { platform: "tiktok" } },
        {
          event: "platform_done",
          data: { platform: "tiktok", content: { tiktokPost: "t" }, modelUsed: "m" },
        },
        { event: "complete", data: { modelUsed: "m" } },
      ])
    );

    await loadPersistedRunOnMount();

    const s = generationStore.get();
    // youtube stays ready (preserved); the other three became ready via resume.
    expect(s.platforms.youtube.status).toBe("ready");
    expect(s.platforms.linkedin.status).toBe("ready");
    expect(s.platforms.instagram.status).toBe("ready");
    expect(s.platforms.tiktok.status).toBe("ready");
    expect(s.stage).toBe("done");
    expect(mockFetch.mock.calls[1][0]).toBe("/api/runs/r1/resume");
  });

  it("marks missing platforms as error on stream failure (finished cards stay visible)", async () => {
    mockFetch.mockImplementationOnce(async () =>
      jsonOk(
        runPayload({
          status: "partial",
          platformResults: [{ platform: "youtube", status: "ready", content: { title: "T" } }],
        })
      )
    );
    // resume fetch resolves to a 500 JSON → consumeSseStream throws.
    mockFetch.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ error: "Mistral down" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
    );

    await loadPersistedRunOnMount();

    const s = generationStore.get();
    // youtube stays ready (preserved).
    expect(s.platforms.youtube.status).toBe("ready");
    // missing platforms marked error, NOT a global stage flip that hides cards.
    expect(s.platforms.linkedin.status).toBe("error");
    expect(s.stage).not.toBe("error");
  });

  it("prefers the localStorage runId over /latest", async () => {
    localStorage.setItem("nca-run-id", "stored-id");
    mockFetch.mockImplementationOnce(async () =>
      jsonOk(runPayload({ id: "stored-id", status: "done", platformResults: [] }))
    );

    await loadPersistedRunOnMount();

    expect(mockFetch.mock.calls[0][0]).toBe("/api/runs/stored-id");
  });

  it("does nothing when no run exists (404)", async () => {
    mockFetch.mockImplementationOnce(async () => new Response("{}", { status: 404 }));
    await loadPersistedRunOnMount();
    expect(generationStore.get().stage).toBe("idle");
  });
});

describe("resumeRun", () => {
  const mockFetch = vi.fn() as any;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    reset();
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("treats a 409 (nothing to resume) as success, not an error", async () => {
    mockFetch.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ error: "Run ist bereits vollständig." }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        })
    );

    await resumeRun("r1", ["linkedin"]);

    // No error flip; the platform stays as it was (not "error").
    expect(generationStore.get().stage).not.toBe("error");
  });

  it("no-ops when there are no missing platforms", async () => {
    await resumeRun("r1", []);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
