import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn() as any;
vi.stubGlobal("fetch", mockFetch);

vi.mock("../../src/utils/audio-extraction.js", () => ({
  extractAudioToWav: vi.fn(async () => ({ wavPath: "/tmp/fake/audio.wav", workDir: "/tmp/fake" })),
  cleanupWorkDir: vi.fn(async () => {}),
}));

vi.mock("../../src/utils/transcriber.js", () => ({
  transcribeWavFile: vi.fn(async () => ({
    text: "Roh-Transkript aus dem Video.",
    model: "voxtral-mini-latest",
  })),
}));

vi.mock("../../src/utils/persistence.js", () => ({
  startRun: vi.fn(async (input: { filename: string; inputSource: "caption" | "video" }) => ({
    id: "test-run-id",
    filename: input.filename,
    inputSource: input.inputSource,
    status: "running" as const,
    rawTranscript: null,
    correctedTranscript: null,
    keywords: null,
    chatHistory: null,
    model: null,
    videoDuration: null,
    errorMessage: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })),
  persistTurn1: vi.fn(async () => {}),
  persistPlatformResult: vi.fn(async () => {}),
  finishRun: vi.fn(async () => {}),
  loadRun: vi.fn(async () => null),
  findLatestRun: vi.fn(async () => null),
  missingPlatforms: vi.fn(async () => []),
  newRunId: vi.fn(() => "test-run-id"),
}));

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

function mockTurns() {
  mockFetch.mockImplementationOnce(async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              transcript: "Korrigiertes Transkript.",
              keywords: ["A", "B", "C"],
            }),
          },
        },
      ],
    }),
  }));
  for (const p of [
    { title: "YT Titel", description: "YT Beschreibung lang genug." },
    { linkedinPost: "LinkedIn Inhalt #a" },
    { instagramPost: "Insta Inhalt #php #phpstan #vitest #vibecoding #nevercodealone" },
    { tiktokPost: "TikTok Inhalt" },
  ]) {
    mockFetch.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(p) } }] }),
    }));
  }
}

function videoFormRequest() {
  const fileData = Buffer.alloc(1024);
  const file = new File([fileData], "test.mp4", { type: "video/mp4" });
  if (typeof (file as any).arrayBuffer !== "function") {
    (file as any).arrayBuffer = async () =>
      fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
  }
  const formData = { get: (name: string) => (name === "video" ? file : null) };
  return { formData: () => Promise.resolve(formData) } as unknown as Request;
}

describe("SSE endpoints", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generate-all streams run_started + transcript_done + 4 platform_done + complete", async () => {
    mockTurns();
    const POST = (await import("../../src/pages/api/generate-all.js")).POST;
    const response = await POST({
      request: {
        json: () => Promise.resolve({ transcript: "Ein Transkript mit genügend Inhalt." }),
      },
    } as any);
    expect(response.status).toBe(200);
    const events = await readSseEvents(response);
    const names = events.map((e) => e.event);
    expect(names[0]).toBe("run_started");
    expect(names.filter((n) => n === "platform_done")).toHaveLength(4);
    expect(names[names.length - 1]).toBe("complete");
    const yt = events.find((e) => e.event === "platform_done" && e.data.platform === "youtube");
    expect(yt!.data.modelUsed).toBe("Ollama/gpt-oss:20b");
  });

  it("emits platform_error and continues when one platform fails validation", async () => {
    mockFetch.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: JSON.stringify({ transcript: "Korrigiert.", keywords: ["A"] }) } },
        ],
      }),
    }));
    mockFetch.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ title: "" }) } }] }),
    }));
    for (const p of [
      { linkedinPost: "LinkedIn Inhalt #a" },
      { instagramPost: "Insta #php #phpstan #vitest #vibecoding #nevercodealone" },
      { tiktokPost: "TikTok Inhalt" },
    ]) {
      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(p) } }] }),
      }));
    }
    const POST = (await import("../../src/pages/api/generate-all.js")).POST;
    const response = await POST({
      request: {
        json: () => Promise.resolve({ transcript: "Ein Transkript mit genügend Inhalt." }),
      },
    } as any);
    const events = await readSseEvents(response);
    expect(events.some((e) => e.event === "platform_error" && e.data.platform === "youtube")).toBe(
      true
    );
    expect(events.filter((e) => e.event === "platform_done")).toHaveLength(3);
    expect(events[events.length - 1].event).toBe("complete");
  });

  it("generate-from-video streams the full pipeline for a valid video upload", async () => {
    mockTurns();
    const POST = (await import("../../src/pages/api/generate-from-video.js")).POST;
    const response = await POST({ request: videoFormRequest() } as any);
    expect(response.status).toBe(200);
    const events = await readSseEvents(response);
    const names = events.map((e) => e.event);
    expect(names).toContain("extraction_started");
    expect(names).toContain("transcript_done");
    expect(events.filter((e) => e.event === "platform_done")).toHaveLength(4);
    expect(names[names.length - 1]).toBe("complete");
  });
});
