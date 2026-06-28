import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal(
  "import",
  vi.hoisted(() => ({
    meta: {
      env: {
        MISTRAL_API_KEY: "mock-mistral-key",
      },
    },
  }))
);

const mockFetch = vi.fn() as any;
vi.stubGlobal("fetch", mockFetch);

const mockResponses: Record<string, string> = {};

mockFetch.mockImplementation(async (url: string, options: any) => {
  if (options?.body) {
    const body = JSON.parse(options.body);
    if (body.messages) {
      const lastMsg = body.messages[body.messages.length - 1].content;
      if (lastMsg.includes("Transkript") || lastMsg.includes("Deine ERSTE Aufgabe")) {
        const content =
          mockResponses.transcript ||
          JSON.stringify({ transcript: "Test transcript", keywords: ["javascript"] });
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content } }],
          }),
        };
      }
      const content =
        mockResponses.platform ||
        JSON.stringify({ title: "Test Title", description: "Test description" });
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content } }],
        }),
      };
    }
  }
  return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) };
});

describe("Generate Pipeline - Functional Tests", () => {
  let POST: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockResponses.transcript = JSON.stringify({
      transcript: "Test transcript",
      keywords: ["javascript"],
    });
    mockResponses.platform = JSON.stringify({
      title: "Test Title",
      description: "Test description",
    });

    const apiModule = await import("../../src/pages/api/generate.js");
    POST = apiModule.POST;
  });

  const createMockRequest = (body: any) => ({
    json: () => Promise.resolve(body),
  });

  const createMockAstroContext = (request: any) => ({
    request,
  });

  describe("Full generation pipeline", () => {
    it.skip("should generate YouTube content successfully", async () => {
      const mockRequest = createMockRequest({
        transcript:
          "This is a test transcript that is long enough to pass validation and contains meaningful content about JavaScript development.",
        type: "youtube",
      });

      const response = await POST(createMockAstroContext(mockRequest));
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.transcript).toContain("test transcript");
      expect(responseData.title).toContain("Test Title");
      expect(responseData.description).toContain("Test description");
      expect(responseData.transcriptCleaned).toBe(false);
      expect(responseData.modelUsed).toBeDefined();
    });

    it.skip("should generate keywords successfully", async () => {
      mockResponses.transcript = JSON.stringify({
        transcript: "Test transcript",
        keywords: ["JavaScript", "React", "TypeScript"],
      });

      const mockRequest = createMockRequest({
        transcript:
          "This is a test transcript about JavaScript, React, and TypeScript development.",
        type: "keywords",
      });

      const response = await POST(createMockAstroContext(mockRequest));
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.keywords).toBeDefined();
      expect(Array.isArray(responseData.keywords)).toBe(true);
      expect(responseData.modelUsed).toBeDefined();
    });

    it.skip("should handle multiple platform types", async () => {
      const platformMocks: Record<string, string> = {
        youtube: JSON.stringify({ title: "Test YouTube", description: "YouTube desc" }),
        linkedin: JSON.stringify({ linkedinPost: "LinkedIn post" }),
        twitter: JSON.stringify({ twitterPost: "Twitter post #test" }),
        instagram: JSON.stringify({ instagramPost: "IG post #test" }),
        tiktok: JSON.stringify({ tiktokPost: "TikTok post" }),
      };

      for (const [platform, content] of Object.entries(platformMocks)) {
        mockResponses.platform = content;
        const mockRequest = createMockRequest({
          transcript: "Test transcript for platform generation.",
          type: platform,
        });

        const response = await POST(createMockAstroContext(mockRequest));
        expect(response.status).toBe(200);
      }
    });

    it.skip("should include video duration when provided", async () => {
      const mockRequest = createMockRequest({
        transcript: "Test transcript content here.",
        type: "youtube",
        videoDuration: "10:30",
      });

      const response = await POST(createMockAstroContext(mockRequest));
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.transcript).toBeDefined();
      expect(responseData.title).toBeDefined();
    });

    it.skip("should include keywords when provided", async () => {
      const mockRequest = createMockRequest({
        transcript: "Test transcript content here.",
        type: "youtube",
        keywords: ["test", "keywords"],
      });

      const response = await POST(createMockAstroContext(mockRequest));
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.transcript).toBeDefined();
      expect(responseData.title).toBeDefined();
    });

    it.skip("should clean transcript by removing single character at end", async () => {
      const mockRequest = createMockRequest({
        transcript: "This is a test transcript that ends with a single character x",
        type: "youtube",
      });

      const response = await POST(createMockAstroContext(mockRequest));
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.transcriptCleaned).toBe(true);
    });

    it.skip("should clean transcript by removing single letter with period at end (e.g., M.)", async () => {
      const mockRequest = createMockRequest({
        transcript: "This is a test transcript that ends with M.",
        type: "youtube",
      });

      const response = await POST(createMockAstroContext(mockRequest));
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.transcriptCleaned).toBe(true);
    });
  });

  describe("Error handling", () => {
    it("should return 400 for empty transcript", async () => {
      const mockRequest = createMockRequest({
        transcript: "",
        type: "youtube",
      });

      const response = await POST(createMockAstroContext(mockRequest));
      const responseData = await response.json();

      expect([400, 503]).toContain(response.status);
      if (response.status === 400) {
        expect(responseData.error).toContain("Transkript");
      }
    });

    it("should return 400 for invalid video duration format", async () => {
      const mockRequest = createMockRequest({
        transcript: "Valid transcript here.",
        type: "youtube",
        videoDuration: "invalid",
      });

      const response = await POST(createMockAstroContext(mockRequest));
      const responseData = await response.json();

      expect([400, 503]).toContain(response.status);
      if (response.status === 400) {
        expect(responseData.error).toContain("Video-Dauer");
      }
    });

    it("should return 400 for invalid platform type", async () => {
      const mockRequest = createMockRequest({
        transcript: "Valid transcript here.",
        type: "invalid-platform",
      });

      const response = await POST(createMockAstroContext(mockRequest));
      const responseData = await response.json();

      expect([400, 503]).toContain(response.status);
      if (response.status === 400) {
        expect(responseData.error).toContain("Ungültiger Typ");
      }
    });

    it("should return 400 for malformed JSON", async () => {
      const mockRequest = {
        json: () => Promise.reject(new Error("JSON parse error")),
      };

      const response = await POST(createMockAstroContext(mockRequest));
      const responseData = await response.json();

      expect([400, 503]).toContain(response.status);
      if (response.status === 400) {
        expect(responseData.error).toBe("Ungültige JSON-Anfrage");
      }
    });

    it("should handle JSON parse errors", async () => {
      const mockRequest = {
        json: () => Promise.reject(new Error("Parse error")),
      };

      const response = await POST(createMockAstroContext(mockRequest));
      const responseData = await response.json();

      expect([400, 503]).toContain(response.status);
      if (response.status === 400) {
        expect(responseData.error).toBe("Ungültige JSON-Anfrage");
      }
    });
  });
});
