import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetDbForTests, closeDb } from "../../db/client.js";

const mockFetch = vi.fn() as any;
vi.stubGlobal("fetch", mockFetch);

async function readSseEvents(response: Response) {
  const text = await response.text();
  const events: Array<{ event: string; data: any }> = [];
  for (const block of text.split("\n\n")) {
    const lines = block.trim().split("\n").filter(Boolean);
    if (lines.length === 0) continue;
    const eventLine = lines.find((l) => l.startsWith("event: "));
    const dataLine = lines.find((l) => l.startsWith("data: "));
    if (eventLine && dataLine) {
      events.push({ event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) });
    }
  }
  return events;
}

function mistralTurn(content: object) {
  mockFetch.mockImplementationOnce(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
  }));
}

describe("resume endpoint", () => {
  let POST: any;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = mkdtempSync(join(tmpdir(), "nca-resume-test-"));
    process.env.DATABASE_PATH = join(tmpDir, "test.db");
    __resetDbForTests();
    const mod = await import("../../src/pages/api/runs/[id]/resume.js");
    POST = mod.POST;
  });

  afterEach(async () => {
    await closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.DATABASE_PATH;
  });

  function ctx(id: string) {
    return { params: { id } } as any;
  }

  it("regenerates only the missing platforms and marks the run done", async () => {
    const { createRun, saveTurn1, savePlatformResult } = await import(
      "../../db/runs-repository.js"
    );
    await createRun({ id: "r", filename: "v.mp4", inputSource: "video" });
    await saveTurn1("r", {
      rawTranscript: "raw",
      correctedTranscript: "korrigiert",
      keywords: ["a"],
      chatHistory: [
        { role: "user", content: "init" },
        {
          role: "assistant",
          content: JSON.stringify({ transcript: "korrigiert", keywords: ["a"] }),
        },
      ],
      model: "mistral-large-latest",
    });
    // youtube already ready, linkedin already ready — only instagram + tiktok missing.
    await savePlatformResult("r", "youtube", { status: "ready", content: { title: "T" } });
    await savePlatformResult("r", "linkedin", { status: "ready", content: { linkedinPost: "p" } });

    // Only two Mistral turns expected (instagram, tiktok).
    mistralTurn({ instagramPost: "IG #nca #duisburg #ncatestify" });
    mistralTurn({ tiktokPost: "TT content" });

    const response = await POST(ctx("r"));
    expect(response.status).toBe(200);

    const events = await readSseEvents(response);
    const names = events.map((e) => e.event);

    expect(names[0]).toBe("run_started");
    const dones = events.filter((e) => e.event === "platform_done").map((e) => e.data.platform);
    expect(dones).toEqual(["instagram", "tiktok"]);
    expect(names[names.length - 1]).toBe("complete");

    // The run should now be done.
    const { getRun } = await import("../../db/runs-repository.js");
    const run = await getRun("r");
    expect(run?.status).toBe("done");
    expect(run?.platformResults.find((p) => p.platform === "instagram")?.status).toBe("ready");

    // Turn 1 must NOT have been re-run — only two fetch calls (instagram + tiktok).
    expect(mockFetch.mock.calls).toHaveLength(2);
  });

  it("returns 404 for an unknown run id", async () => {
    const response = await POST(ctx("does-not-exist"));
    expect(response.status).toBe(404);
  });

  it("returns 409 when the run has no restorable chat history", async () => {
    const { createRun } = await import("../../db/runs-repository.js");
    await createRun({ id: "r2", filename: "v.mp4", inputSource: "video" });
    // No saveTurn1 → no chatHistory.
    const response = await POST(ctx("r2"));
    expect(response.status).toBe(409);
  });

  it("returns 409 when all platforms are already ready", async () => {
    const { createRun, saveTurn1, savePlatformResult } = await import(
      "../../db/runs-repository.js"
    );
    await createRun({ id: "r3", filename: "v.mp4", inputSource: "video" });
    await saveTurn1("r3", {
      rawTranscript: "raw",
      correctedTranscript: "k",
      keywords: [],
      chatHistory: [
        { role: "user", content: "init" },
        { role: "assistant", content: "{}" },
      ],
      model: "m",
    });
    for (const p of ["youtube", "linkedin", "instagram", "tiktok"] as const) {
      await savePlatformResult("r3", p, { status: "ready", content: { x: 1 } });
    }
    const response = await POST(ctx("r3"));
    expect(response.status).toBe(409);
  });
});
