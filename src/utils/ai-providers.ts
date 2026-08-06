import { AI_MODELS } from "../config/constants.js";

export interface AIProvider {
  readonly name: string;
  readonly models: readonly string[];
  startChatSession?(): void;
  sendChatMessage?(
    message: string,
    responseFormat?: {
      type: "json_schema";
      json_schema: { schema: object; name: string; strict: true };
    }
  ): Promise<{ text: string; model: string }>;
  /** Snapshot the chat message history for persistence. */
  serializeChatHistory?(): Array<{ role: string; content: string }>;
  /** Replace the chat message history (used when resuming a persisted run). */
  restoreChatHistory?(messages: Array<{ role: string; content: string }>): void;
}

export function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\[503\]|\[429\]|503 Service Unavailable|429 Too Many Requests|Resource has been exhausted|rate_limited|Rate limit exceeded/i.test(
    message
  );
}

async function withRetry<T>(
  fn: () => Promise<T>,
  providerName: string,
  maxRetries = 3,
  baseDelayMs = 2000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (!isRetryableError(error) && !(error instanceof Error && error.name === "AbortError")) {
        throw error;
      }

      if (attempt >= maxRetries - 1) {
        throw error;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt);
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(
        `${providerName} retryable error, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries}): ${errorMsg}`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error("Unreachable");
}

/**
 * The text-generation provider. Ollama (OpenAI-compatible) is the sole text
 * provider — chat turns for transcript correction, keywords, and per-platform
 * posts all run here. Audio transcription is a separate concern (Mistral
 * Voxtral, see transcriber.ts) and does not use this provider.
 */
export class OllamaProvider implements AIProvider {
  readonly name = "Ollama";
  readonly models: readonly string[];
  private apiKey: string;
  private baseUrl = import.meta.env.OLLAMA_BASE_URL || "https://ollama.com/v1";
  private chatSession: { messages: Array<{ role: string; content: string }> } | null = null;
  private _currentModel: string = "";

  /** Backoff base delay for retries. Overridable for tests; production default 2000ms. */
  retryBaseDelayMs = 2000;

  /** Per-request timeout in ms. Defaults to OLLAMA_TIMEOUT_MS env or 180000 (3 min);
   * overridable per-call for tests. Large models can be slow, so this is generous. */
  private requestTimeoutMs: number;

  get currentModel(): string {
    return this._currentModel;
  }

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    const modelName = model || AI_MODELS.ollama;
    this.models = [modelName];
    const fromEnv = Number(import.meta.env.OLLAMA_TIMEOUT_MS);
    this.requestTimeoutMs = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 180000;
  }

  private async callApi(
    messages: Array<{ role: string; content: string }>,
    model: string,
    responseFormat?: {
      type: "json_schema";
      json_schema: { schema: object; name: string; strict: true };
    },
    timeoutMs = this.requestTimeoutMs
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const body: Record<string, unknown> = { model, messages };
    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[${response.status}] ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  }

  startChatSession(): void {
    this._currentModel = this.models[0];
    this.chatSession = { messages: [] };
  }

  serializeChatHistory(): Array<{ role: string; content: string }> {
    return this.chatSession ? [...this.chatSession.messages] : [];
  }

  restoreChatHistory(messages: Array<{ role: string; content: string }>): void {
    this._currentModel = this._currentModel || this.models[0];
    this.chatSession = { messages: [...messages] };
  }

  async sendChatMessage(
    message: string,
    responseFormat?: {
      type: "json_schema";
      json_schema: { schema: object; name: string; strict: true };
    }
  ): Promise<{ text: string; model: string }> {
    if (!this.chatSession) {
      throw new Error("Chat session not started. Call startChatSession() first.");
    }

    return withRetry(
      async () => {
        const messagesForRequest = [
          ...this.chatSession!.messages,
          { role: "user", content: message },
        ];

        const text = await this.callApi(messagesForRequest, this._currentModel, responseFormat);

        this.chatSession!.messages.push({ role: "user", content: message });
        this.chatSession!.messages.push({ role: "assistant", content: text });

        return { text, model: `Ollama/${this._currentModel}` };
      },
      this.name,
      3,
      this.retryBaseDelayMs
    );
  }
}

/**
 * Builds the text-generation provider from environment configuration. Ollama
 * is the sole text provider; throws if OLLAMA_API_KEY is not set.
 */
export function createTextProvider(): OllamaProvider {
  const apiKey = import.meta.env.OLLAMA_API_KEY;
  if (!apiKey) {
    throw new Error("OLLAMA_API_KEY is not set — text generation unavailable.");
  }
  return new OllamaProvider(apiKey);
}
