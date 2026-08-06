import type { GenerateResponse } from "../types/index.js";
import type { GenerationPlatform, ProgressEvent } from "./generation-session.js";

/**
 * Server-Sent Events stream for the generation pipeline.
 * Wraps a ReadableStream and formats events per the SSE wire protocol.
 */
export class SseStream {
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  private encoder = new TextEncoder();
  private closed = false;

  readonly stream: ReadableStream<Uint8Array>;

  constructor() {
    this.stream = new ReadableStream({
      start: (controller) => {
        this.controller = controller;
      },
      // Client disconnect (reload / tab close / SSE drop) cancels the stream.
      // Mark closed so subsequent event()/close() calls no-op instead of
      // throwing "Controller is already closed" — the pipeline runs detached
      // and would otherwise surface as an unhandled rejection.
      cancel: () => {
        this.closed = true;
      },
    });
  }

  event(name: string, data: object): void {
    if (this.closed) return;
    const payload = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
    try {
      this.controller.enqueue(this.encoder.encode(payload));
    } catch {
      // Controller closed under us (client disconnect) — stop emitting.
      this.closed = true;
    }
  }

  /** Maps internal progress events onto the wire protocol. */
  emitProgress(event: ProgressEvent): void {
    switch (event.type) {
      case "platform_started":
        this.event("platform_started", { platform: event.platform });
        break;
      case "humanizer_retry":
        this.event("humanizer_retry", { platform: event.platform });
        break;
      case "platform_completed":
        // completion payload (with content) is sent by the caller via platform_done
        break;
    }
  }

  sendPlatformDone(
    platform: GenerationPlatform,
    response: Partial<GenerateResponse>,
    modelUsed: string,
    humanizerWarnings?: string[]
  ): void {
    this.event("platform_done", { platform, content: response, modelUsed, humanizerWarnings });
  }

  sendRunStarted(runId: string, filename: string): void {
    this.event("run_started", { runId, filename });
  }

  sendError(stage: string, message: string): void {
    this.event("error", { stage, message });
  }

  sendComplete(modelUsed: string): void {
    this.event("complete", { modelUsed });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.controller.close();
    } catch {
      // Already closed by a client disconnect — nothing to do.
    }
  }
}

export function sseResponse(stream: SseStream): Response {
  return new Response(stream.stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
