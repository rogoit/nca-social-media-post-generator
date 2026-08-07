import { describe, it, expect, vi, beforeEach } from "vitest";
import { GenerationSession } from "../../src/utils/generation-session.js";
import { OllamaProvider } from "../../src/utils/ai-providers.js";

const mockFetch = vi.fn() as any;
vi.stubGlobal("fetch", mockFetch);

function respondOnce(content: string | object) {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  mockFetch.mockImplementationOnce(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: text } }] }),
  }));
}

const MODEL = "Ollama/gpt-oss:20b";
const TRANSCRIPT = "Das hier ist ein langes Test Transkript mit genug Inhalt für die Validierung.";

function newSession() {
  const s = new GenerationSession(new OllamaProvider("test-key"));
  (s.provider as OllamaProvider).retryBaseDelayMs = 1;
  return s;
}

describe("GenerationSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("initializes: corrects transcript and extracts keywords in turn 1", async () => {
    respondOnce({ transcript: "Korrigiertes Transkript.", keywords: ["a", "b"] });
    const session = newSession();
    const result = await session.initialize(TRANSCRIPT);
    expect(result.correctedTranscript).toBe("Korrigiertes Transkript.");
    expect(result.keywords).toEqual(["a", "b"]);
    expect(session.currentModel).toBe(MODEL);
  });

  it("generates a platform with parsed content, model, and corrected transcript on YouTube", async () => {
    respondOnce({ transcript: "Korrigiert.", keywords: ["a"] });
    const session = newSession();
    await session.initialize(TRANSCRIPT);
    respondOnce({ title: "Titel", description: "Desc desc desc." });
    const result = await session.generatePlatform("youtube", TRANSCRIPT);
    expect(result.response.title).toBe("Titel");
    expect(result.response.transcript).toBe("Korrigiert.");
    expect(result.modelUsed).toBe(MODEL);
  });

  it("restoreFrom restores history + fields without re-running turn 1", async () => {
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
    expect(mockFetch).not.toHaveBeenCalled();

    respondOnce({ linkedinPost: "LinkedIn Post #nca" });
    await session.generatePlatform("linkedin", "raw");
    const [, options] = mockFetch.mock.calls[0];
    const req = JSON.parse(options.body);
    expect(req.messages[0].content).toBe("initial turn-1 message");
    expect(req.messages.length).toBeGreaterThanOrEqual(3);
  });
});
