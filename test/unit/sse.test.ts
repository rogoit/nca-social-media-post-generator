import { describe, it, expect } from "vitest";
import { SseStream } from "../../src/utils/sse.js";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe("SseStream", () => {
  it("emits events in the SSE wire format", async () => {
    const sse = new SseStream();
    sse.event("transcript_done", { transcript: "x" });
    sse.close();
    const text = await readAll(sse.stream);
    expect(text).toContain("event: transcript_done");
    expect(text).toContain(`data: ${JSON.stringify({ transcript: "x" })}`);
  });

  it("no-ops event()/close() after the client cancels (disconnect)", async () => {
    const sse = new SseStream();
    await sse.stream.cancel();
    expect(() => sse.event("platform_done", { platform: "youtube" })).not.toThrow();
    expect(() => sse.sendComplete("Ollama/gpt-oss:20b")).not.toThrow();
    expect(() => sse.close()).not.toThrow();
  });
});
