import { describe, it, expect, vi, beforeEach } from "vitest";
import { GenerationSession } from "../../src/utils/generation-session.js";
import type { ProgressEvent } from "../../src/utils/generation-session.js";
import { MistralProvider } from "../../src/utils/ai-providers.js";

const mockFetch = vi.fn() as any;
vi.stubGlobal("fetch", mockFetch);

interface MockCall {
  messages: Array<{ role: string; content: string }>;
  model: string;
}

function lastRequest(): MockCall {
  const [, options] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return JSON.parse(options.body);
}

function respondOnce(content: string | object) {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  mockFetch.mockImplementationOnce(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: text } }] }),
  }));
}

function respondErrorOnce(status: number, body: string) {
  mockFetch.mockImplementationOnce(async () => ({
    ok: false,
    status,
    text: async () => body,
  }));
}

const TRANSCRIPT = "Das hier ist ein langes Test Transkript mit genug Inhalt für die Validierung.";

describe("GenerationSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initialize", () => {
    it("should correct transcript and extract keywords in turn 1", async () => {
      respondOnce({
        transcript: "Korrigiertes Transkript.",
        keywords: ["a", "b"],
      });

      const session = new GenerationSession("test-key");
      const result = await session.initialize(TRANSCRIPT);

      expect(result.correctedTranscript).toBe("Korrigiertes Transkript.");
      expect(result.keywords).toEqual(["a", "b"]);
      expect(session.correctedTranscript).toBe("Korrigiertes Transkript.");
      expect(session.keywords).toEqual(["a", "b"]);
      expect(session.currentModel).toBe("mistral-large-latest");
    });

    it("should fall back to original transcript when AI returns none", async () => {
      respondOnce({ keywords: ["a"] });

      const session = new GenerationSession("test-key");
      await session.initialize(TRANSCRIPT);

      expect(session.correctedTranscript).toBe(TRANSCRIPT);
    });

    it("should not share state across instances", async () => {
      respondOnce({ transcript: "Session A Transkript.", keywords: ["a"] });
      respondOnce({ transcript: "Session B Transkript.", keywords: ["b"] });

      const a = new GenerationSession("test-key");
      const b = new GenerationSession("test-key");
      await a.initialize("Transcript A Text hier.");
      await b.initialize("Transcript B Text hier.");

      expect(a.correctedTranscript).toBe("Session A Transkript.");
      expect(b.correctedTranscript).toBe("Session B Transkript.");
    });
  });

  describe("generatePlatform", () => {
    async function initializedSession(emit?: (e: ProgressEvent) => void) {
      respondOnce({ transcript: "Korrigiert.", keywords: ["a"] });
      const session = new GenerationSession("test-key", emit);
      await session.initialize(TRANSCRIPT);
      return session;
    }

    it("should return parsed platform content with model name", async () => {
      const session = await initializedSession();
      respondOnce({ linkedinPost: "Mein LinkedIn Post #nca" });

      const result = await session.generatePlatform("linkedin", TRANSCRIPT);

      expect(result.response.linkedinPost).toContain("LinkedIn Post");
      expect(result.modelUsed).toBe("mistral-large-latest");
      expect(result.humanizerWarnings).toBeUndefined();
    });

    it("should attach corrected transcript to YouTube responses", async () => {
      const session = await initializedSession();
      respondOnce({ title: "Titel", description: "Desc desc desc." });

      const result = await session.generatePlatform("youtube", TRANSCRIPT);

      expect(result.response.transcript).toBe("Korrigiert.");
    });

    it("should throw when response fails validation", async () => {
      const session = await initializedSession();
      respondOnce({ title: "" });

      await expect(session.generatePlatform("youtube", TRANSCRIPT)).rejects.toThrow(
        "AI-Antwort enthält keine gültigen Inhalte"
      );
    });

    it("should emit progress events in order", async () => {
      const events: ProgressEvent[] = [];
      const session = await initializedSession((e) => events.push(e));
      respondOnce({ instagramPost: "IG Post #nca #duisburg #ncatestify" });

      await session.generatePlatform("instagram", TRANSCRIPT);

      expect(events.map((e) => e.type)).toEqual(["platform_started", "platform_completed"]);
    });
  });

  describe("humanizer retry", () => {
    async function initializedSession(emit?: (e: ProgressEvent) => void) {
      respondOnce({ transcript: "Korrigiert.", keywords: ["a"] });
      const session = new GenerationSession("test-key", emit);
      (session.provider as MistralProvider).retryBaseDelayMs = 1;
      await session.initialize(TRANSCRIPT);
      return session;
    }

    it("should accept clean retry output without warnings", async () => {
      const session = await initializedSession();
      respondOnce({ linkedinPost: "Das wird die Social Media Welt revolutionieren!" });
      respondOnce({ linkedinPost: "Sauberer Post ohne verbotene Wörter." });

      const result = await session.generatePlatform("linkedin", TRANSCRIPT);

      expect(result.response.linkedinPost).toContain("Sauberer Post");
      expect(result.humanizerWarnings).toBeUndefined();
    });

    it("should keep cleaner retry and surface reduced warnings", async () => {
      const session = await initializedSession();
      respondOnce({
        linkedinPost: "Revolutionär, disruptiv und unglaublich toll!",
      });
      respondOnce({ linkedinPost: "Nur noch unglaublich toll, Rest sauber." });

      const result = await session.generatePlatform("linkedin", TRANSCRIPT);

      expect(result.response.linkedinPost).toContain("Nur noch unglaublich");
      expect(result.humanizerWarnings).toEqual(["unglaublich"]);
    });

    it("should warn on original violations when retry does not improve", async () => {
      const session = await initializedSession();
      respondOnce({ linkedinPost: "Bahnbrechend und disruptiv." });
      respondOnce({ linkedinPost: "Bahnbrechend und disruptiv." });

      const result = await session.generatePlatform("linkedin", TRANSCRIPT);

      expect(result.response.linkedinPost).toBe("Bahnbrechend und disruptiv.");
      expect(result.humanizerWarnings).toEqual(
        expect.arrayContaining(["Bahnbrechend", "disruptiv"])
      );
    });

    it("should emit humanizer_retry event during retry", async () => {
      const events: ProgressEvent[] = [];
      const session = await initializedSession((e) => events.push(e));
      respondOnce({ tiktokPost: "Bahnbrechend." });
      respondOnce({ tiktokPost: "Sauber." });

      await session.generatePlatform("tiktok", TRANSCRIPT);

      expect(events.map((e) => e.type)).toEqual([
        "platform_started",
        "humanizer_retry",
        "platform_completed",
      ]);
    });
  });

  describe("fallback model", () => {
    it("should rethrow last error when no fallback model is configured", async () => {
      respondOnce({ transcript: "Korrigiert.", keywords: ["a"] });
      const session = new GenerationSession("test-key");
      (session.provider as MistralProvider).retryBaseDelayMs = 1;
      await session.initialize(TRANSCRIPT);
      expect(session.currentModel).toBe("mistral-large-latest");

      // Retries inside the provider (3 attempts), then restartOnFallbackModel
      // finds no second model configured -> original error propagates.
      const errorBody =
        '{"object":"error","message":"Rate limit exceeded","type":"rate_limited","param":null,"code":"1300","raw_status_code":429}';
      respondErrorOnce(429, errorBody);
      respondErrorOnce(429, errorBody);
      respondErrorOnce(429, errorBody);

      await expect(session.generatePlatform("linkedin", TRANSCRIPT)).rejects.toThrow("[429]");
    });
  });

  describe("request isolation via fetch payloads", () => {
    it("should send full chat history on subsequent messages", async () => {
      respondOnce({ transcript: "Korrigiert.", keywords: ["a"] });
      const session = new GenerationSession("test-key");
      (session.provider as MistralProvider).retryBaseDelayMs = 1;
      await session.initialize(TRANSCRIPT);

      respondOnce({ linkedinPost: "LinkedIn Content." });
      await session.generatePlatform("linkedin", TRANSCRIPT);

      const req = lastRequest();
      expect(req.messages.length).toBeGreaterThanOrEqual(3); // user init + assistant + platform msg
      expect(req.messages[0].role).toBe("user");
    });
  });
});
