import { describe, it, expect, beforeEach } from "vitest";
import {
  generationStore,
  reset,
  beginGenerating,
  handleSseEvent,
  enterKeywordStage,
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
});
