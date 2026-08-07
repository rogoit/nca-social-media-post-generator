import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { transcribeWavFile } from "../../src/utils/transcriber.js";

const mockFetch = vi.fn() as any;
vi.stubGlobal("fetch", mockFetch);

let fixturePath: string;

describe("transcriber", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    fixturePath = join(tmpdir(), `fixture-${randomBytes(4).toString("hex")}.wav`);
    await writeFile(fixturePath, Buffer.from("RIFF dummy wav content"));
  });

  afterEach(async () => {
    if (fixturePath && existsSync(fixturePath)) await rm(fixturePath, { force: true });
  });

  it("POSTs multipart with file/model/language and returns the transcript text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "Hallo Welt, das ist das Transkript." }),
    });

    const result = await transcribeWavFile(fixturePath, "test-key", { language: "de" });

    expect(result.text).toBe("Hallo Welt, das ist das Transkript.");
    expect(result.model).toBe("voxtral-mini-latest");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.mistral.ai/v1/audio/transcriptions");
    expect(init.headers["x-api-key"]).toBe("test-key");
    const fd = init.body as FormData;
    expect(fd.get("model")).toBe("voxtral-mini-latest");
    expect(fd.get("language")).toBe("de");
    expect(fd.get("file")).toBeInstanceOf(Blob);
  });
});
