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

  it("no-ops event() and close() after the client cancels (disconnect)", async () => {
    const sse = new SseStream();
    // Simulate the browser closing the SSE stream mid-flight.
    await sse.stream.cancel();

    // These must NOT throw, even though the underlying controller is closed.
    expect(() => sse.event("platform_done", { platform: "youtube" })).not.toThrow();
    expect(() => sse.sendComplete("mistral-large-latest")).not.toThrow();
    expect(() => sse.close()).not.toThrow();
  });

  it("does not throw when close() is called twice", () => {
    const sse = new SseStream();
    sse.close();
    expect(() => sse.close()).not.toThrow();
  });

  it("stops emitting after an enqueue fails on a closed controller", async () => {
    const sse = new SseStream();
    await sse.stream.cancel();
    // First event() after cancel swallows the enqueue error and marks closed.
    expect(() => sse.event("complete", { modelUsed: "m" })).not.toThrow();
    // A subsequent read of the (cancelled) stream yields nothing.
    const reader = sse.stream.getReader();
    const { done } = await reader.read();
    expect(done).toBe(true);
  });
});
