import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetDbForTests, closeDb } from "../../db/client.js";

async function withTempDb<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "nca-repo-test-"));
  const dbPath = join(dir, "test.db");
  process.env.DATABASE_PATH = dbPath;
  __resetDbForTests();
  try {
    return await fn();
  } finally {
    await closeDb();
    delete process.env.DATABASE_PATH;
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("runs-repository", () => {
  beforeEach(() => {
    __resetDbForTests();
  });

  afterEach(async () => {
    await closeDb();
  });

  it("createRun wipes prior runs (single-user, latest-only policy)", async () => {
    await withTempDb(async () => {
      const { createRun, getLatestRun } = await import("../../db/runs-repository.js");
      const first = await createRun({
        id: "run-1",
        filename: "a.mp4",
        inputSource: "video",
      });
      expect(first.id).toBe("run-1");
      expect(first.status).toBe("running");

      const second = await createRun({
        id: "run-2",
        filename: "b.mp4",
        inputSource: "video",
      });
      expect(second.id).toBe("run-2");

      // run-1 should be gone — only the latest run is kept.
      const latest = await getLatestRun();
      expect(latest?.id).toBe("run-2");
    });
  });

  it("saveTurn1 stores transcript, keywords, chatHistory, model as JSON", async () => {
    await withTempDb(async () => {
      const { createRun, saveTurn1, getRun } = await import("../../db/runs-repository.js");
      await createRun({ id: "r", filename: "v.mp4", inputSource: "video" });
      await saveTurn1("r", {
        rawTranscript: "raw",
        correctedTranscript: "korrigiert",
        keywords: ["a", "b"],
        chatHistory: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "ho" },
        ],
        model: "mistral-large-latest",
      });

      const run = await getRun("r");
      expect(run?.rawTranscript).toBe("raw");
      expect(run?.correctedTranscript).toBe("korrigiert");
      expect(run?.keywords).toEqual(["a", "b"]);
      expect(run?.chatHistory).toEqual([
        { role: "user", content: "hi" },
        { role: "assistant", content: "ho" },
      ]);
      expect(run?.model).toBe("mistral-large-latest");
    });
  });

  it("savePlatformResult upserts per (runId, platform)", async () => {
    await withTempDb(async () => {
      const { createRun, savePlatformResult, getRun } = await import("../../db/runs-repository.js");
      await createRun({ id: "r", filename: "v.mp4", inputSource: "video" });

      await savePlatformResult("r", "youtube", {
        status: "pending",
      });
      let run = await getRun("r");
      expect(run?.platformResults.find((p) => p.platform === "youtube")?.status).toBe("pending");

      // Second write to the same (runId, platform) updates, not inserts.
      await savePlatformResult("r", "youtube", {
        status: "ready",
        content: { title: "T" },
        model: "mistral-large-latest",
      });
      run = await getRun("r");
      const yt = run?.platformResults.find((p) => p.platform === "youtube");
      expect(yt?.status).toBe("ready");
      expect(yt?.content).toEqual({ title: "T" });
      expect(run?.platformResults).toHaveLength(1);
    });
  });

  it("savePlatformResult stores error status + message", async () => {
    await withTempDb(async () => {
      const { createRun, savePlatformResult, getRun } = await import("../../db/runs-repository.js");
      await createRun({ id: "r", filename: "v.mp4", inputSource: "video" });
      await savePlatformResult("r", "linkedin", {
        status: "error",
        errorMessage: "boom",
      });
      const run = await getRun("r");
      const li = run?.platformResults.find((p) => p.platform === "linkedin");
      expect(li?.status).toBe("error");
      expect(li?.errorMessage).toBe("boom");
    });
  });

  it("markRunStatus transitions status and stores error message", async () => {
    await withTempDb(async () => {
      const { createRun, markRunStatus, getRun } = await import("../../db/runs-repository.js");
      await createRun({ id: "r", filename: "v.mp4", inputSource: "video" });

      await markRunStatus("r", "partial");
      expect((await getRun("r"))?.status).toBe("partial");

      await markRunStatus("r", "error", "fatal");
      const run = await getRun("r");
      expect(run?.status).toBe("error");
      expect(run?.errorMessage).toBe("fatal");
    });
  });

  it("getLatestRun returns the most recent run regardless of status", async () => {
    await withTempDb(async () => {
      const { createRun, markRunStatus, getLatestRun } = await import(
        "../../db/runs-repository.js"
      );
      // createRun wipes prior runs, so we can only have one at a time here.
      await createRun({ id: "r", filename: "v.mp4", inputSource: "video" });
      expect((await getLatestRun())?.status).toBe("running");

      await markRunStatus("r", "partial");
      expect((await getLatestRun())?.status).toBe("partial");

      // A completed run is STILL returned (hydration needs it).
      await markRunStatus("r", "done");
      expect((await getLatestRun())?.id).toBe("r");
      expect((await getLatestRun())?.status).toBe("done");

      // A newer run supersedes an older one.
      await createRun({ id: "r2", filename: "v2.mp4", inputSource: "video" });
      await markRunStatus("r2", "error", "kaputt");
      expect((await getLatestRun())?.id).toBe("r2");
    });
  });

  it("getMissingPlatforms returns platforms without ready status", async () => {
    await withTempDb(async () => {
      const { createRun, savePlatformResult, getMissingPlatforms } = await import(
        "../../db/runs-repository.js"
      );
      const ALL = ["youtube", "linkedin", "instagram", "tiktok"] as const;
      await createRun({ id: "r", filename: "v.mp4", inputSource: "video" });
      await savePlatformResult("r", "youtube", { status: "ready", content: { title: "t" } });
      await savePlatformResult("r", "linkedin", { status: "error", errorMessage: "x" });

      // "ready" platforms are skipped; errored + untouched platforms are
      // both regenerated on resume.
      const missing = await getMissingPlatforms("r", [...ALL]);
      expect(missing).toEqual(["linkedin", "instagram", "tiktok"]);
    });
  });

  it("deleting a run cascades to its platform results", async () => {
    await withTempDb(async () => {
      const db = await import("../../db/client.js");
      const schema = await import("../../db/schema.js");
      const { createRun, savePlatformResult, getRun } = await import("../../db/runs-repository.js");
      await createRun({ id: "r", filename: "v.mp4", inputSource: "video" });
      await savePlatformResult("r", "youtube", { status: "ready", content: { t: 1 } });

      const con = await db.getDb();
      await con.delete(schema.runs);

      // getRun returns null; platform results are gone via cascade.
      expect(await getRun("r")).toBeNull();
    });
  });
});
