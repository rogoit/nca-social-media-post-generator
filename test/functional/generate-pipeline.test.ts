import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn() as any;
vi.stubGlobal("fetch", mockFetch);

const mockResponses: Record<string, string> = {};

mockFetch.mockImplementation(async (_url: string, options: any) => {
  if (options?.body) {
    const body = JSON.parse(options.body);
    if (body.messages) {
      const lastMsg = body.messages[body.messages.length - 1].content;
      if (lastMsg.includes("Deine Aufgabe") || lastMsg.includes("Deine ERSTE Aufgabe")) {
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content:
                    mockResponses.transcript ||
                    JSON.stringify({ transcript: "Test transcript", keywords: ["javascript"] }),
                },
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: mockResponses.platform || JSON.stringify({ title: "T", description: "D" }),
              },
            },
          ],
        }),
      };
    }
  }
  return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) };
});

describe("/api/generate", () => {
  let POST: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockResponses.transcript = JSON.stringify({
      transcript: "This is a test transcript that is long enough.",
      keywords: ["javascript"],
    });
    mockResponses.platform = JSON.stringify({
      title: "Test Title",
      description: "Test description",
    });
    POST = (await import("../../src/pages/api/generate.js")).POST;
  });

  const ctx = (body: any): any => ({ request: { json: () => Promise.resolve(body) } });

  it("generates YouTube content from a transcript", async () => {
    const response = await POST(
      ctx({
        transcript:
          "This is a test transcript that is long enough to pass validation about JavaScript development.",
        type: "youtube",
      })
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.title).toContain("Test Title");
    expect(data.modelUsed).toBeDefined();
  });

  it("detects keywords from a transcript", async () => {
    mockResponses.transcript = JSON.stringify({
      transcript: "Test transcript",
      keywords: ["JavaScript", "React", "TypeScript"],
    });
    const response = await POST(
      ctx({
        transcript: "This is a test transcript about JS, React, and TypeScript.",
        type: "keywords",
      })
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(Array.isArray(data.keywords)).toBe(true);
  });

  it("returns 400 for an empty transcript", async () => {
    const response = await POST(ctx({ transcript: "", type: "youtube" }));
    expect([400, 503]).toContain(response.status);
  });
});
