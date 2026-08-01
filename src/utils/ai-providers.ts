import type { AIError } from "../types/index.js";
import { AI_MODELS } from "../config/constants.js";

export interface AIProvider {
  readonly name: string;
  readonly models: readonly string[];
  generateContent?(prompt: string): Promise<{ text: string; model: string }>;
  startChatSession?(): void;
  sendChatMessage?(
    message: string,
    responseFormat?: {
      type: "json_schema";
      json_schema: { schema: object; name: string; strict: true };
    }
  ): Promise<{ text: string; model: string }>;
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

function collectError(error: unknown, providerName: string): AIError {
  return {
    provider: providerName,
    message: error instanceof Error ? error.message : "Unbekannter Fehler",
    status: (error as { status?: number }).status,
  };
}

export class MistralProvider implements AIProvider {
  readonly name = "Mistral";
  readonly models = AI_MODELS.mistral;
  private apiKey: string;
  private baseUrl = "https://api.mistral.ai/v1";
  private chatSession: { messages: Array<{ role: string; content: string }> } | null = null;
  private _currentModel: string = "";

  /** Backoff base delay for retries. Overridable for tests; production default 2000ms. */
  retryBaseDelayMs = 2000;

  get currentModel(): string {
    return this._currentModel;
  }

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async callApi(
    messages: Array<{ role: string; content: string }>,
    model: string,
    responseFormat?: {
      type: "json_schema";
      json_schema: { schema: object; name: string; strict: true };
    },
    timeoutMs = 120000
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

  async generateContent(prompt: string): Promise<{ text: string; model: string }> {
    const errors: AIError[] = [];

    for (const model of this.models) {
      try {
        const text = await this.callApi([{ role: "user", content: prompt }], model);
        return { text, model };
      } catch (error: unknown) {
        const aiError = collectError(error, this.name);
        errors.push(aiError);
        console.error(`Mistral error with ${model}:`, aiError.message);
      }
    }

    throw new Error(`${this.name} failed: ${errors.map((e) => e.message).join(", ")}`);
  }

  startChatSession(): void {
    this._currentModel = this.models[0];
    this.chatSession = { messages: [] };
  }

  startChatSessionWithModel(modelName: string): void {
    if (!this.models.includes(modelName)) {
      throw new Error(`Model ${modelName} not available. Use: ${this.models.join(", ")}`);
    }
    this._currentModel = modelName;
    this.chatSession = { messages: [] };
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

        return { text, model: this._currentModel };
      },
      this.name,
      3,
      this.retryBaseDelayMs
    );
  }
}

export class OllamaProvider implements AIProvider {
  readonly name = "Ollama";
  readonly models: readonly string[];
  private apiKey: string;
  private baseUrl = "https://ollama.com/api";
  private chatSession: { messages: Array<{ role: string; content: string }> } | null = null;
  private _currentModel: string = "";

  retryBaseDelayMs = 2000;

  get currentModel(): string {
    return this._currentModel;
  }

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    const modelName = model || AI_MODELS.ollama;
    this.models = [modelName];
  }

  private async callApi(
    messages: Array<{ role: string; content: string }>,
    model: string,
    responseFormat?: {
      type: "json_schema";
      json_schema: { schema: object; name: string; strict: true };
    },
    timeoutMs = 120000
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const body: Record<string, unknown> = { model, messages };
    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
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
