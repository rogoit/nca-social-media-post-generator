import type { APIContext } from 'astro';

/**
 * Creates mock Astro request for testing
 */
export function createMockRequest(overrides?: {
  platform?: string;
  transcript?: string;
  youtubeUrl?: string;
}): Request {
  const body = {
    platform: overrides?.platform || 'youtube',
    transcript: overrides?.transcript || 'Sample transcript for testing',
    youtubeUrl: overrides?.youtubeUrl,
  };

  return new Request('http://localhost:4321/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Creates mock Astro API context
 */
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
    generator: 'Astro v4.0.0',
    clientAddress: '127.0.0.1',
  } as APIContext;
}

/**
 * Creates mock transcript of specified length
 */
export function createMockTranscript(length: number): string {
  const words = [
    'innovation', 'technology', 'digital', 'transformation', 'strategy',
    'solution', 'business', 'enterprise', 'platform', 'development',
    'customer', 'experience', 'analytics', 'cloud', 'security',
  ];

  const result: string[] = [];
  let currentLength = 0;

  while (currentLength < length) {
    const word = words[Math.floor(Math.random() * words.length)];
    result.push(word);
    currentLength += word.length + 1; // +1 for space
  }

  return result.join(' ').substring(0, length);
}

/**
 * Creates mock AI response for testing
 */
export function createMockAIResponse(platform: string, content?: string): any {
  const defaultContent = content || `Sample ${platform} post content`;

  // Gemini response format
  if (platform === 'gemini') {
    return {
      response: {
        text: () => defaultContent,
      },
    };
  }

  // Claude response format
  return {
    content: [{ type: 'text', text: defaultContent }],
  };
}
