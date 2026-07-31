import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn() as any;
vi.stubGlobal("fetch", mockFetch);

interface SseEvent {
  event: string;
  data: any;
}

async function readSseEvents(response: Response): Promise<SseEvent[]> {
  const text = await response.text();
  const events: SseEvent[] = [];
  for (const block of text.split("\n\n")) {
    const lines = block.trim().split("\n").filter(Boolean);
    if (lines.length === 0) continue;
    const eventLine = lines.find((l) => l.startsWith("event: "));
    const dataLine = lines.find((l) => l.startsWith("data: "));
    if (eventLine && dataLine) {
      events.push({
        event: eventLine.slice(7),
        data: JSON.parse(dataLine.slice(6)),
      });
    }
  }
  return events;
}

function mockMistralTurns() {
  // Turn 1: transcript correction + keywords
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
  // Turns 2-5: platform contents (youtube, linkedin, instagram, tiktok)
  const platforms = [
    { title: "YT Titel", description: "YT Beschreibung lang genug." },
    { linkedinPost: "LinkedIn Inhalt #a" },
    { instagramPost: "Insta Inhalt #nca #duisburg #ncatestify" },
    { tiktokPost: "TikTok Inhalt" },
  ];
  for (const p of platforms) {
    mockFetch.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(p) } }] }),
    }));
  }
}

describe("generate-all SSE endpoint", () => {
  let POST: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../src/pages/api/generate-all.js");
    POST = mod.POST;
  });

  function jsonRequest(body: object) {
    return { json: () => Promise.resolve(body) } as unknown as Request;
  }

  it("should stream transcript_done + 4 platform_done + complete events", async () => {
    mockMistralTurns();

    const response = await POST({
      request: jsonRequest({ transcript: "Ein Transkript mit genügend Inhalt." }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    const events = await readSseEvents(response);
    const names = events.map((e) => e.event);

    expect(names[0]).toBe("transcript_done");
    expect(names).toContain("platform_started");
    expect(names.filter((n) => n === "platform_done")).toHaveLength(4);
    expect(names[names.length - 1]).toBe("complete");

    const transcriptDone = events.find((e) => e.event === "transcript_done");
    expect(transcriptDone!.data.transcript).toBe("Korrigiertes Transkript.");
    expect(transcriptDone!.data.keywords).toEqual(["A", "B", "C"]);

    const ytDone = events.find((e) => e.event === "platform_done" && e.data.platform === "youtube");
    expect(ytDone!.data.content.title).toBe("YT Titel");
    expect(ytDone!.data.content.description).toContain("YT Beschreibung");
    expect(ytDone!.data.modelUsed).toBe("mistral-large-latest");

    const liDone = events.find(
      (e) => e.event === "platform_done" && e.data.platform === "linkedin"
    );
    expect(liDone!.data.content.linkedinPost).toContain("LinkedIn Inhalt");

    // Per plan: all four platforms only — no twitter anywhere.
    const platforms = events.filter((e) => e.event === "platform_done").map((e) => e.data.platform);
    expect(platforms).toEqual(["youtube", "linkedin", "instagram", "tiktok"]);
  });

  it("should emit platform_error and continue when one platform fails validation", async () => {
    // Turn 1 ok
    mockFetch.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ transcript: "Korrigiert.", keywords: ["A"] }),
            },
          },
        ],
      }),
    }));
    // youtube: invalid (missing title)
    mockFetch.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ title: "" }) } }] }),
    }));
    // remaining platforms ok
    for (const p of [
      { linkedinPost: "LinkedIn Inhalt #a" },
      { instagramPost: "Insta #nca #duisburg #ncatestify" },
      { tiktokPost: "TikTok Inhalt" },
    ]) {
      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(p) } }] }),
      }));
    }

    const response = await POST({
      request: jsonRequest({ transcript: "Ein Transkript mit genügend Inhalt." }),
    });
    const events = await readSseEvents(response);

    const ytError = events.find(
      (e) => e.event === "platform_error" && e.data.platform === "youtube"
    );
    expect(ytError).toBeDefined();
    expect(ytError!.data.message).toContain("gültigen Inhalte");

    expect(events.filter((e) => e.event === "platform_done")).toHaveLength(3);
    expect(events[events.length - 1].event).toBe("complete");
  });

  it("should return 400 JSON for invalid transcript (pre-stream validation)", async () => {
    const response = await POST({ request: jsonRequest({ transcript: "" }) });
    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  it("should return 400 for invalid videoDuration format", async () => {
    const response = await POST({
      request: jsonRequest({ transcript: "Gültiges Transkript hier.", videoDuration: "abc" }),
    });
    expect(response.status).toBe(400);
  });

  it("should pass videoDuration into the YouTube schema turn", async () => {
    mockMistralTurns();

    const response = await POST({
      request: jsonRequest({
        transcript: "Ein Transkript mit genügend Inhalt.",
        videoDuration: "7:16",
      }),
    });
    await readSseEvents(response);

    // Second fetch call = youtube platform turn; its body must request json_schema with timestamps
    const youtubeCall = mockFetch.mock.calls[1];
    const body = JSON.parse(youtubeCall[1].body);
    expect(body.response_format.json_schema.schema.properties).toHaveProperty("timestamps");
  });
});

describe("generate-from-video SSE endpoint", () => {
  let POST: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../src/pages/api/generate-from-video.js");
    POST = mod.POST;
  });

  function videoFormRequest({
    withVideo = true,
    size = 1024,
    type = "video/mp4",
    videoDuration,
  }: {
    withVideo?: boolean;
    size?: number;
    type?: string;
    videoDuration?: string;
  }) {
    const fileData = Buffer.alloc(size);
    const file = new File([fileData], "test.mp4", { type });
    // jsdom's File lacks arrayBuffer(); shim with the buffer we wrote into it.
    if (typeof (file as any).arrayBuffer !== "function") {
      (file as any).arrayBuffer = async () =>
        fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
    }
    const formData = {
      get: (name: string) => {
        if (name === "video") return withVideo ? file : null;
        if (name === "videoDuration") return videoDuration ?? null;
        return null;
      },
    };
    return { formData: () => Promise.resolve(formData) } as unknown as Request;
  }

  it("should stream the full pipeline for a valid video upload", async () => {
    // Gemini transcript extraction (Google API shape)
    mockFetch.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Roh-Transkript aus dem Video." }] } }],
      }),
    }));
    mockMistralTurns();

    const response = await POST({ request: videoFormRequest({}) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    const events = await readSseEvents(response);
    const names = events.map((e) => e.event);

    expect(names).toContain("transcript_done");
    expect(events.filter((e) => e.event === "platform_done")).toHaveLength(4);
    expect(names[names.length - 1]).toBe("complete");

    const transcriptDone = events.find((e) => e.event === "transcript_done");
    expect(transcriptDone!.data.transcript).toBe("Korrigiertes Transkript.");
  });

  it("should return 400 when no video is attached", async () => {
    const response = await POST({ request: videoFormRequest({ withVideo: false }) });
    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  it("should return 400 for disallowed video type", async () => {
    const response = await POST({
      request: videoFormRequest({ type: "video/avi" }),
    });
    expect(response.status).toBe(400);
  });

  it("should return 400 for videos exceeding 100 MB", async () => {
    // Don't allocate 100MB in a test — validateVideoFile reads .size, so fake it.
    const fakeFile = {
      name: "huge.mp4",
      size: 101 * 1024 * 1024,
      type: "video/mp4",
    };
    const request = {
      formData: () =>
        Promise.resolve({
          get: (name: string) => (name === "video" ? fakeFile : null),
        }),
    } as unknown as Request;

    const response = await POST({ request });
    expect(response.status).toBe(400);
  });
});
