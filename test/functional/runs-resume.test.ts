import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn() as any;
vi.stubGlobal("fetch", mockFetch);

// Mock the persistence layer — the resume route must not touch a real database.
const persistedRun = {
  id: "r",
  filename: "v.mp4",
  inputSource: "video" as const,
  status: "partial",
  rawTranscript: "raw",
  correctedTranscript: "korrigiert",
  keywords: ["a"],
  chatHistory: [
    { role: "user", content: "init" },
    { role: "assistant", content: JSON.stringify({ transcript: "korrigiert", keywords: ["a"] }) },
  ],
  model: "Ollama/gpt-oss:20b",
  videoDuration: null,
  errorMessage: null,
};

vi.mock("../../src/utils/persistence.js", () => ({
  loadRun: vi.fn(async (id: string) => (id === "r" ? persistedRun : null)),
  missingPlatforms: vi.fn(async () => ["instagram", "tiktok"] as const),
  persistPlatformResult: vi.fn(async () => {}),
  finishRun: vi.fn(async () => {}),
  // route also imports createTextProvider indirectly, but resume uses it directly:
}));

// Mock the text provider so the resume route can construct a GenerationSession
// without a real OLLAMA_API_KEY / network during the turn flow (mocked fetch handles calls).
vi.mock("../../src/utils/ai-providers.js", async () => {
  const actual: any = await vi.importActual("../../src/utils/ai-providers.js");
  return {
    ...actual,
    createTextProvider: () => new actual.OllamaProvider("test-key"),
  };
});

async function readSseEvents(response: Response) {
  const text = await response.text();
  const events: Array<{ event: string; data: any }> = [];
  for (const block of text.split("\n\n")) {
    const lines = block.trim().split("\n").filter(Boolean);
    if (lines.length === 0) continue;
    const eventLine = lines.find((l) => l.startsWith("event: "));
    const dataLine = lines.find((l) => l.startsWith("data: "));
    if (eventLine && dataLine)
      events.push({ event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) });
  }
  return events;
}

describe("resume endpoint", () => {
  beforeEach(() => vi.clearAllMocks());

  function ctx(id: string) {
    return { params: { id } } as any;
  }

  it("regenerates only the missing platforms and streams them", async () => {
    // Only the missing platforms (instagram, tiktok) hit the provider.
    mockFetch.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                instagramPost: "IG #php #phpstan #vitest #vibecoding #nevercodealone",
              }),
            },
          },
        ],
      }),
    }));
    mockFetch.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ tiktokPost: "TT content" }) } }],
      }),
    }));

    const POST = (await import("../../src/pages/api/runs/[id]/resume.js")).POST;
    const response = await POST(ctx("r"));
    expect(response.status).toBe(200);

    const events = await readSseEvents(response);
    const dones = events.filter((e) => e.event === "platform_done").map((e) => e.data.platform);
    expect(dones).toEqual(["instagram", "tiktok"]);
    expect(events[events.length - 1].event).toBe("complete");
    // Turn 1 not re-run — only the two missing platforms fetched.
    expect(mockFetch.mock.calls).toHaveLength(2);
  });

  it("returns 404 for an unknown run id", async () => {
    const POST = (await import("../../src/pages/api/runs/[id]/resume.js")).POST;
    const response = await POST(ctx("does-not-exist"));
    expect(response.status).toBe(404);
  });
});
