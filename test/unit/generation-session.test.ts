import { describe, it, expect, vi, beforeEach } from "vitest";
import { GenerationSession } from "../../src/utils/generation-session.js";
import type { ProgressEvent } from "../../src/utils/generation-session.js";
import { OllamaProvider } from "../../src/utils/ai-providers.js";

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

const MODEL = "Ollama/gpt-oss:20b";
const TRANSCRIPT = "Das hier ist ein langes Test Transkript mit genug Inhalt für die Validierung.";

function newSession(emit?: (e: ProgressEvent) => void): GenerationSession {
  return new GenerationSession(new OllamaProvider("test-key"), emit);
}

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

      const session = newSession();
      const result = await session.initialize(TRANSCRIPT);

      expect(result.correctedTranscript).toBe("Korrigiertes Transkript.");
      expect(result.keywords).toEqual(["a", "b"]);
      expect(session.correctedTranscript).toBe("Korrigiertes Transkript.");
      expect(session.keywords).toEqual(["a", "b"]);
      expect(session.currentModel).toBe(MODEL);
    });

    it("should fall back to original transcript when AI returns none", async () => {
      respondOnce({ keywords: ["a"] });

      const session = newSession();
      await session.initialize(TRANSCRIPT);

      expect(session.correctedTranscript).toBe(TRANSCRIPT);
    });

    it("should not share state across instances", async () => {
      respondOnce({ transcript: "Session A Transkript.", keywords: ["a"] });
      respondOnce({ transcript: "Session B Transkript.", keywords: ["b"] });

      const a = newSession();
      const b = newSession();
      await a.initialize("Transcript A Text hier.");
      await b.initialize("Transcript B Text hier.");

      expect(a.correctedTranscript).toBe("Session A Transkript.");
      expect(b.correctedTranscript).toBe("Session B Transkript.");
    });
  });

  describe("generatePlatform", () => {
    async function initializedSession(emit?: (e: ProgressEvent) => void) {
      respondOnce({ transcript: "Korrigiert.", keywords: ["a"] });
      const session = newSession(emit);
      (session.provider as OllamaProvider).retryBaseDelayMs = 1;
      await session.initialize(TRANSCRIPT);
      return session;
    }

    it("should return parsed platform content with model name", async () => {
      const session = await initializedSession();
      respondOnce({ linkedinPost: "Mein LinkedIn Post #nca" });

      const result = await session.generatePlatform("linkedin", TRANSCRIPT);

      expect(result.response.linkedinPost).toContain("LinkedIn Post");
      expect(result.modelUsed).toBe(MODEL);
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
      const session = newSession(emit);
      (session.provider as OllamaProvider).retryBaseDelayMs = 1;
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

  describe("transient errors", () => {
    it("retries via withRetry then rethrows on persistent 429 (no model fallback)", async () => {
      respondOnce({ transcript: "Korrigiert.", keywords: ["a"] });
      const session = newSession();
      (session.provider as OllamaProvider).retryBaseDelayMs = 1;
      await session.initialize(TRANSCRIPT);
      expect(session.currentModel).toBe(MODEL);

      // Persistently return 429 so every retry attempt fails.
      const errorBody =
        '{"object":"error","message":"Rate limit exceeded","type":"rate_limited","param":null,"code":"1300","raw_status_code":429}';
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => errorBody,
      });

      // No fallback exists — the 429 rethrows after retries are exhausted.
      await expect(session.generatePlatform("linkedin", TRANSCRIPT)).rejects.toThrow("[429]");
    }, 15000);
  });

  describe("request isolation via fetch payloads", () => {
    it("should send full chat history on subsequent messages", async () => {
      respondOnce({ transcript: "Korrigiert.", keywords: ["a"] });
      const session = newSession();
      (session.provider as OllamaProvider).retryBaseDelayMs = 1;
      await session.initialize(TRANSCRIPT);

      respondOnce({ linkedinPost: "LinkedIn Content." });
      await session.generatePlatform("linkedin", TRANSCRIPT);

      const req = lastRequest();
      expect(req.messages.length).toBeGreaterThanOrEqual(3); // user init + assistant + platform msg
      expect(req.messages[0].role).toBe("user");
    });
  });

  describe("restoreFrom (resume path)", () => {
    it("restores chat history + fields without re-running turn 1", async () => {
      const session = newSession();
      const history = [
        { role: "user", content: "initial turn-1 message" },
        {
          role: "assistant",
          content: JSON.stringify({ transcript: "Korrigiert.", keywords: ["a"] }),
        },
      ];

      session.restoreFrom({
        chatHistory: history,
        correctedTranscript: "Korrigiert.",
        keywords: ["a"],
        model: MODEL,
      });

      expect(session.correctedTranscript).toBe("Korrigiert.");
      expect(session.keywords).toEqual(["a"]);
      expect(session.currentModel).toBe(MODEL);

      // No fetch should have happened — restoreFrom must not call the AI.
      expect(mockFetch).not.toHaveBeenCalled();

      // The restored history must be sent on the next platform turn.
      respondOnce({ linkedinPost: "LinkedIn Post #nca" });
      await session.generatePlatform("linkedin", "raw");

      const req = lastRequest();
      expect(req.messages[0].role).toBe("user");
      expect(req.messages[0].content).toBe("initial turn-1 message");
      expect(req.messages.length).toBeGreaterThanOrEqual(3);
    });

    it("serializeChatHistory returns the current chat messages", async () => {
      respondOnce({ transcript: "Korrigiert.", keywords: ["a"] });
      const session = newSession();
      await session.initialize(TRANSCRIPT);

      const snapshot = session.serializeChatHistory();
      expect(snapshot.length).toBe(2); // user + assistant from turn 1
      expect(snapshot[0].role).toBe("user");
      expect(snapshot[1].role).toBe("assistant");
    });
  });
});
