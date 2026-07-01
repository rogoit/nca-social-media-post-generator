import type { AIError } from "../types/index.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AI_MODELS, VIDEO_CONSTANTS } from "../config/constants.js";
import { sanitizeApiKey } from "./validation.js";

export interface AIProvider {
  readonly name: string;
  readonly models: readonly string[];
  generateContent(prompt: string): Promise<{ text: string; model: string }>;
  extractTranscript?(
    videoBuffer: Buffer,
    mimeType: string
  ): Promise<{ text: string; model: string }>;
  startChatSession?(): void;
  sendChatMessage?(
    message: string,
    responseFormat?: { type: "json_schema"; json_schema: { schema: object; name: string; strict: true } }
  ): Promise<{ text: string; model: string }>;
}

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\[503\s|503 Service Unavailable|\[429\s|429 Too Many Requests|Resource has been exhausted/i.test(
    message
  );
}

async function withRetry<T>(
  fn: () => Promise<T>,
  providerName: string,
  maxRetries = 3
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

      const delayMs = 2000 * Math.pow(2, attempt);
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

export class GoogleGeminiProvider implements AIProvider {
  readonly name = "Google Gemini";
  readonly models = AI_MODELS.google;
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(sanitizeApiKey(apiKey));
  }

  async generateContent(prompt: string): Promise<{ text: string; model: string }> {
    const errors: AIError[] = [];

    for (const model of this.models) {
      try {
        const genModel = this.genAI.getGenerativeModel({ model });
        const result = await genModel.generateContent(prompt);
        const text = (await result.response).text();
        return { text, model };
      } catch (error: unknown) {
        const aiError = collectError(error, this.name);
        errors.push(aiError);
        console.error(`Fehler mit ${model}:`, aiError.message);
      }
    }

    throw new Error(`${this.name} failed: ${errors.map((e) => e.message).join(", ")}`);
  }

  async extractTranscript(
    videoBuffer: Buffer,
    mimeType: string
  ): Promise<{ text: string; model: string }> {
    const errors: AIError[] = [];

    for (const model of this.models) {
      try {
        const genModel = this.genAI.getGenerativeModel({ model });
        const result = await genModel.generateContent([
          VIDEO_CONSTANTS.TRANSCRIPT_PROMPT,
          { inlineData: { data: videoBuffer.toString("base64"), mimeType } },
        ]);
        const text = (await result.response).text();
        return { text, model };
      } catch (error: unknown) {
        const aiError = collectError(error, this.name);
        errors.push(aiError);
        console.error(`Video transcript extraction failed with ${model}:`, aiError.message);
      }
    }

    throw new Error(
      `${this.name} video transcript extraction failed: ${errors.map((e) => e.message).join(", ")}`
    );
  }

  private chatSession: any = null;
  private chatModel: string = "";

  startChatSession(): void {
    const model = this.models[0];
    this.chatSession = this.genAI.getGenerativeModel({ model }).startChat();
    this.chatModel = model;
  }

  startChatSessionWithModel(modelName: string): void {
    this.chatSession = this.genAI.getGenerativeModel({ model: modelName }).startChat();
    this.chatModel = modelName;
  }

  async sendChatMessage(message: string): Promise<{ text: string; model: string }> {
    if (!this.chatSession) {
      throw new Error("Chat session not started. Call startChatSession() first.");
    }

    return withRetry(async () => {
      const result = await this.chatSession.sendMessage(message);
      const text = (await result.response).text();
      return { text, model: this.chatModel };
    }, this.name);
  }
}

export class MistralProvider implements AIProvider {
  readonly name = "Mistral";
  readonly models = AI_MODELS.mistral;
  private apiKey: string;
  private baseUrl = "https://api.mistral.ai/v1";
  private chatSession: { messages: Array<{ role: string; content: string }> } | null = null;
  private _currentModel: string = "";

  get currentModel(): string {
    return this._currentModel;
  }

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async callApi(
    messages: Array<{ role: string; content: string }>,
    model: string,
    responseFormat?: { type: "json_schema"; json_schema: { schema: object; name: string; strict: true } },
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
    responseFormat?: { type: "json_schema"; json_schema: { schema: object; name: string; strict: true } }
  ): Promise<{ text: string; model: string }> {
    if (!this.chatSession) {
      throw new Error("Chat session not started. Call startChatSession() first.");
    }

    return withRetry(async () => {
      const messagesForRequest = [
        ...this.chatSession!.messages,
        { role: "user", content: message },
      ];

      const text = await this.callApi(messagesForRequest, this._currentModel, responseFormat);

      this.chatSession!.messages.push({ role: "user", content: message });
      this.chatSession!.messages.push({ role: "assistant", content: text });

      return { text, model: this._currentModel };
    }, this.name);
  }
}

export class AIProviderManager {
  private providers: AIProvider[] = [];
  private errors: AIError[] = [];

  constructor(providers: AIProvider[]) {
    this.providers = providers;

    if (this.providers.length === 0) {
      throw new Error("No AI providers configured");
    }
  }

  async generateContent(prompt: string): Promise<{ text: string; model: string }> {
    this.errors = [];

    for (const provider of this.providers) {
      try {
        const result = await provider.generateContent(prompt);
        return result;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";
        this.errors.push({ provider: provider.name, message: errorMessage });
        console.error(`Provider ${provider.name} failed:`, errorMessage);
      }
    }

    const errorMessage = this.errors.map((e) => `${e.provider}: ${e.message}`).join(", ");
    throw new Error(`All AI providers failed: ${errorMessage}`);
  }

  getLastErrors(): AIError[] {
    return [...this.errors];
  }
}
