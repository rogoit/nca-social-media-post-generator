import { describe, it, expect, beforeEach } from "vitest";
import {
  generationStore,
  reset,
  beginGenerating,
  handleSseEvent,
  hydrateRun,
} from "../../src/stores/generation-store.js";

describe("generation-store", () => {
  beforeEach(() => reset());

  it("handles the full SSE event sequence", () => {
    beginGenerating();
    handleSseEvent("run_started", { runId: "abc-123", filename: "v.mp4" });
    handleSseEvent("transcript_done", {
      transcript: "Korrigiert.",
      keywords: ["A", "B"],
      modelUsed: "Ollama/gpt-oss:20b",
    });
    handleSseEvent("platform_started", { platform: "youtube" });
    handleSseEvent("humanizer_retry", { platform: "youtube" });
    handleSseEvent("platform_done", {
      platform: "youtube",
      content: { title: "T", description: "D" },
      modelUsed: "Ollama/gpt-oss:20b",
      humanizerWarnings: ["Revolutionär"],
    });
    handleSseEvent("platform_error", { platform: "linkedin", message: "kaputt" });
    handleSseEvent("complete", { modelUsed: "Ollama/gpt-oss:20b" });

    const s = generationStore.get();
    expect(s.runId).toBe("abc-123");
    expect(s.correctedTranscript).toBe("Korrigiert.");
    expect(s.platforms.youtube.status).toBe("ready");
    expect(s.platforms.youtube.humanizerWarnings).toEqual(["Revolutionär"]);
    expect(s.platforms.linkedin.status).toBe("error");
    expect(s.stage).toBe("done");
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
