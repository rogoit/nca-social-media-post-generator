import type { APIContext } from "astro";
import { vi } from "vitest";

export function createMockRequest(overrides?: {
  platform?: string;
  transcript?: string;
}): Request {
  const body = {
    platform: overrides?.platform || "youtube",
    transcript: overrides?.transcript || "Sample transcript for testing",
  };

  return new Request("http://localhost:4321/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createMockContext(request: Request): APIContext {
  return {
    request,
    params: {},
    url: new URL(request.url),
    props: {},
    redirect: vi.fn(),
    locals: {},
    cookies: {} as any,
    site: undefined,
    generator: "Astro v4.0.0",
    clientAddress: "127.0.0.1",
  } as unknown as APIContext;
}

export function createMockTranscript(length: number): string {
  const words = [
    "innovation",
    "technology",
    "digital",
    "transformation",
    "strategy",
    "solution",
    "business",
    "enterprise",
    "platform",
    "development",
    "customer",
    "experience",
    "analytics",
    "cloud",
    "security",
  ];

  const result: string[] = [];
  let currentLength = 0;

  while (currentLength < length) {
    const word = words[Math.floor(Math.random() * words.length)];
    result.push(word);
    currentLength += word.length + 1;
  }

  return result.join(" ").substring(0, length);
}

export function createMockGeminiResponse(content?: string) {
  return {
    response: {
      text: () => content || "Sample response content",
    },
  };
}
