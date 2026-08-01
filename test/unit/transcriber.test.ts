import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { transcribeWavFile, TranscriptionError } from "../../src/utils/transcriber.js";

const mockFetch = vi.fn() as any;
vi.stubGlobal("fetch", mockFetch);

let fixturePath: string;

describe("transcriber", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    fixturePath = join(tmpdir(), `fixture-${randomBytes(4).toString("hex")}.wav`);
    await writeFile(fixturePath, Buffer.from("RIFF dummy wav content for unit test"));
  });

  afterEach(async () => {
    if (fixturePath && existsSync(fixturePath)) {
      await rm(fixturePath, { force: true });
    }
  });

  it("should POST multipart with file/model/language and return transcript text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "Hallo Welt, das ist das Transkript." }),
    });

    const result = await transcribeWavFile(fixturePath, "test-key", { language: "de" });

    expect(result.text).toBe("Hallo Welt, das ist das Transkript.");
    expect(result.model).toBe("voxtral-mini-latest");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.mistral.ai/v1/audio/transcriptions");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("test-key");

    const fd = init.body as FormData;
    expect(fd.get("model")).toBe("voxtral-mini-latest");
    expect(fd.get("language")).toBe("de");
    expect(fd.get("file")).toBeInstanceOf(Blob);
    expect((fd.get("file") as Blob).type).toBe("audio/wav");
  });

  it("should omit language when not provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "transcript" }),
    });

    await transcribeWavFile(fixturePath, "test-key");
    const fd = (mockFetch.mock.calls[0][1] as any).body as FormData;
    expect(fd.get("language")).toBeNull();
  });

  it("should throw TranscriptionError with status on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });

    try {
      await transcribeWavFile(fixturePath, "test-key");
      expect.unreachable("expected transcribeWavFile to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TranscriptionError);
      expect((error as TranscriptionError).status).toBe(429);
      expect((error as Error).message).toContain("429");
    }
  });

  it("should throw on empty transcript text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "" }),
    });

    await expect(transcribeWavFile(fixturePath, "test-key")).rejects.toThrow(/empty/i);
  });

  it("should wrap AbortError into a timeout TranscriptionError", async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));

    await expect(transcribeWavFile(fixturePath, "test-key", { timeoutMs: 50 })).rejects.toThrow(
      /timed out/
    );
  });
});
