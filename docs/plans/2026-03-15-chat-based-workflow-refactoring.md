# Chat-Based Workflow Refactoring

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 6-separate-Gemini-calls workflow with a single chat session. The corrected transcript becomes a finished value used by all platforms. Old per-platform `/api/generate` endpoint gets replaced entirely.

**Architecture:** One Gemini `startChat()` session handles everything. Turn 1 corrects transcript + extracts keywords. Turns 2-6 generate platform-specific content using short follow-up messages (no repeated brand rules/transcript). The UI has one "Generate All" action — user pastes transcript, clicks once, gets everything.

**Tech Stack:** Astro API routes, `@google/generative-ai` SDK (`startChat()`), Vitest

---

## UX Flow (Clean)

```
1. User pastes raw transcript + optional video duration
2. User clicks "Generieren"
3. Loading state across all sections
4. Results appear:
   ├── Corrected Transcript (finished, copyable)
   ├── Keywords (finished, shown as tags)
   ├── YouTube: Title + Description + Timestamps
   ├── LinkedIn: Post
   ├── Twitter: Post
   ├── Instagram: Post
   └── TikTok: Post
```

One action. One API call. All results at once. The corrected transcript is the source of truth — it's shown first as a completed value, and all platform posts are derived from it.

---

## File Structure

| Action  | File                                   | Responsibility                                                             |
| ------- | -------------------------------------- | -------------------------------------------------------------------------- |
| Modify  | `src/types/index.ts`                   | Replace old types with `GenerateAllRequest` / `GenerateAllResponse`        |
| Modify  | `src/utils/ai-providers.ts`            | Add `startChatSession()` and `sendChatMessage()` to `GoogleGeminiProvider` |
| Create  | `src/config/chat-prompts.ts`           | System message + short per-platform follow-up messages                     |
| Replace | `src/pages/api/generate.ts`            | Becomes the single endpoint running the chat workflow                      |
| Delete  | `src/pages/api/generate-from-video.ts` | Removed (video upload flow will use the same chat approach later)          |
| Replace | `src/utils/api.ts`                     | Single `generateAllContent()` client function                              |
| Modify  | `src/utils/app.ts`                     | Remove per-platform form handlers, single generate action                  |
| Delete  | `src/utils/prompt-factory.ts`          | Replaced by `chat-prompts.ts`                                              |
| Modify  | `src/config/prompts.ts`                | Keep only `GLOBAL_PROMPT_HELPERS`, remove `PLATFORM_PROMPTS`               |
| Create  | `test/unit/chat-prompts.test.ts`       | Tests for chat prompt construction                                         |
| Create  | `test/unit/ai-providers-chat.test.ts`  | Tests for chat session methods                                             |
| Modify  | `test/unit/prompt-factory.test.ts`     | Remove or replace with chat-prompts tests                                  |

---

## Chunk 1: Chat Session Support in AI Provider

### Task 1: Add types for the new workflow

**Files:**

- Modify: `src/types/index.ts`
- Create: `test/unit/types-generate-all.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/types-generate-all.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type {
  GenerateAllRequest,
  GenerateAllResponse,
  PlatformResult,
} from "../../src/types/index.js";

describe("GenerateAll types", () => {
  it("should define GenerateAllRequest shape", () => {
    const request: GenerateAllRequest = {
      transcript: "test transcript",
      videoDuration: "7:16",
    };
    expect(request.transcript).toBe("test transcript");
    expect(request.videoDuration).toBe("7:16");
  });

  it("should define GenerateAllResponse with all platforms", () => {
    const response: GenerateAllResponse = {
      correctedTranscript: "corrected text",
      keywords: ["PHP", "Testing"],
      youtube: { title: "Title", description: "Desc" },
      linkedin: { post: "LinkedIn post" },
      twitter: { post: "Twitter post" },
      instagram: { post: "Instagram post" },
      tiktok: { post: "TikTok post" },
      modelUsed: "gemini-2.5-pro",
    };
    expect(response.correctedTranscript).toBe("corrected text");
    expect(response.youtube.title).toBe("Title");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- test/unit/types-generate-all.test.ts`
Expected: FAIL - types not exported

- [ ] **Step 3: Add new types to `src/types/index.ts`**

Add at end of file:

```typescript
export interface GenerateAllRequest {
  transcript: string;
  videoDuration?: string;
}

export interface PlatformResult {
  title?: string;
  description?: string;
  timestamps?: string;
  post?: string;
}

export interface GenerateAllResponse {
  correctedTranscript: string;
  keywords: string[];
  youtube: PlatformResult;
  linkedin: PlatformResult;
  twitter: PlatformResult;
  instagram: PlatformResult;
  tiktok: PlatformResult;
  modelUsed: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- test/unit/types-generate-all.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts test/unit/types-generate-all.test.ts
git commit -m "feat: add GenerateAllRequest and GenerateAllResponse types"
```

---

### Task 2: Add chat session methods to GoogleGeminiProvider

**Files:**

- Modify: `src/utils/ai-providers.ts`
- Create: `test/unit/ai-providers-chat.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/ai-providers-chat.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { GoogleGeminiProvider } from "../../src/utils/ai-providers.js";

vi.mock("@google/generative-ai", () => {
  const mockSendMessage = vi.fn().mockResolvedValue({
    response: { text: () => "mocked response" },
  });
  const mockStartChat = vi.fn(() => ({ sendMessage: mockSendMessage }));
  const mockGetGenerativeModel = vi.fn(() => ({
    startChat: mockStartChat,
    generateContent: vi.fn(),
  }));

  return {
    GoogleGenerativeAI: vi.fn(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    })),
  };
});

describe("GoogleGeminiProvider chat session", () => {
  it("should have startChatSession method", () => {
    const provider = new GoogleGeminiProvider("test-key");
    expect(typeof provider.startChatSession).toBe("function");
  });

  it("should have sendChatMessage method", () => {
    const provider = new GoogleGeminiProvider("test-key");
    expect(typeof provider.sendChatMessage).toBe("function");
  });

  it("should throw if sendChatMessage called before startChatSession", async () => {
    const provider = new GoogleGeminiProvider("test-key");
    await expect(provider.sendChatMessage("hello")).rejects.toThrow("Chat session not started");
  });

  it("should return text and model after sendChatMessage", async () => {
    const provider = new GoogleGeminiProvider("test-key");
    provider.startChatSession();
    const result = await provider.sendChatMessage("hello");
    expect(result.text).toBe("mocked response");
    expect(result.model).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- test/unit/ai-providers-chat.test.ts`
Expected: FAIL - methods don't exist

- [ ] **Step 3: Add chat methods to `GoogleGeminiProvider` in `src/utils/ai-providers.ts`**

Add to the `AIProvider` interface:

```typescript
startChatSession?(): void;
sendChatMessage?(message: string): Promise<{ text: string; model: string }>;
```

Add to `GoogleGeminiProvider` class body (after `extractTranscript`):

```typescript
private chatSession: any = null;
private chatModel: string = "";

startChatSession(): void {
  const model = this.models[0];
  const genModel = this.genAI.getGenerativeModel({ model });
  this.chatSession = genModel.startChat();
  this.chatModel = model;
}

async sendChatMessage(message: string): Promise<{ text: string; model: string }> {
  if (!this.chatSession) {
    throw new Error("Chat session not started. Call startChatSession() first.");
  }
  const result = await this.chatSession.sendMessage(message);
  const response = await result.response;
  const text = response.text();
  return { text, model: this.chatModel };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- test/unit/ai-providers-chat.test.ts`
Expected: PASS

- [ ] **Step 5: Run all existing tests**

Run: `npm run test:unit`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/ai-providers.ts test/unit/ai-providers-chat.test.ts
git commit -m "feat: add chat session methods to GoogleGeminiProvider"
```

---

## Chunk 2: Chat Prompts

### Task 3: Create chat prompt templates

**Files:**

- Create: `src/config/chat-prompts.ts`
- Create: `test/unit/chat-prompts.test.ts`

Key design: The initial message contains ALL shared context (brand names, rules, transcript). Follow-up messages are SHORT — just platform-specific instructions (~50-100 tokens each). The model remembers context from the chat.

- [ ] **Step 1: Write the failing test**

Create `test/unit/chat-prompts.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ChatPrompts } from "../../src/config/chat-prompts.js";

describe("ChatPrompts", () => {
  const transcript = "Heute zeige ich euch wie man mit clode code arbeitet.";

  describe("createInitialMessage", () => {
    it("should include brand names rules", () => {
      const msg = ChatPrompts.createInitialMessage(transcript);
      expect(msg).toContain("Never Code Alone");
    });

    it("should include the transcript", () => {
      const msg = ChatPrompts.createInitialMessage(transcript);
      expect(msg).toContain(transcript);
    });

    it("should request TRANSCRIPT and KEYWORDS sections", () => {
      const msg = ChatPrompts.createInitialMessage(transcript);
      expect(msg).toContain("TRANSCRIPT:");
      expect(msg).toContain("KEYWORDS:");
    });

    it("should include transcript correction hints", () => {
      const msg = ChatPrompts.createInitialMessage(transcript);
      expect(msg).toContain('"Claude"');
      expect(msg).toContain('"PHP"');
      expect(msg).toContain('"Sulu"');
    });
  });

  describe("createPlatformMessage", () => {
    it("should create short YouTube message without brand names", () => {
      const msg = ChatPrompts.createPlatformMessage("youtube");
      expect(msg).toContain("TITLE:");
      expect(msg).toContain("DESCRIPTION:");
      expect(msg).not.toContain("Never Code Alone");
    });

    it("should include timestamps when videoDuration provided", () => {
      const msg = ChatPrompts.createPlatformMessage("youtube", { videoDuration: "7:16" });
      expect(msg).toContain("TIMESTAMPS:");
      expect(msg).toContain("7:16");
    });

    it("should not include timestamps without videoDuration", () => {
      const msg = ChatPrompts.createPlatformMessage("youtube");
      expect(msg).not.toContain("TIMESTAMPS:");
    });

    it("should create short LinkedIn message", () => {
      const msg = ChatPrompts.createPlatformMessage("linkedin");
      expect(msg).toContain("LINKEDIN POST:");
      expect(msg).not.toContain("Never Code Alone");
    });

    it("should create short Twitter message", () => {
      const msg = ChatPrompts.createPlatformMessage("twitter");
      expect(msg).toContain("TWITTER POST:");
      expect(msg.length).toBeLessThan(1000);
    });

    it("should create short Instagram message", () => {
      const msg = ChatPrompts.createPlatformMessage("instagram");
      expect(msg).toContain("INSTAGRAM POST:");
      expect(msg).toContain("#nca #duisburg #ncatestify");
    });

    it("should create short TikTok message", () => {
      const msg = ChatPrompts.createPlatformMessage("tiktok");
      expect(msg).toContain("TIKTOK POST:");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- test/unit/chat-prompts.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Create `src/config/chat-prompts.ts`**

```typescript
import { GLOBAL_PROMPT_HELPERS } from "./prompts.js";

type ChatPlatform = "youtube" | "linkedin" | "twitter" | "instagram" | "tiktok";

interface PlatformMessageOptions {
  videoDuration?: string;
}

export class ChatPrompts {
  static createInitialMessage(transcript: string): string {
    return `Du bist ein Social-Media-Content-Optimierungsassistent für Entwickler-Content im Jahr 2025.

${GLOBAL_PROMPT_HELPERS.BRAND_NAMES}

${GLOBAL_PROMPT_HELPERS.AVOID_EXAGGERATION}

${GLOBAL_PROMPT_HELPERS.INFORMAL_ADDRESS}

Hier ist das Transkript eines Videos. Es enthält Erkennungsfehler aus der Sprache-zu-Text-Umwandlung.

Transkript:
${transcript}

Deine ERSTE Aufgabe:
1. Erstelle eine korrigierte Version des Transkripts mit AUSSCHLIESSLICH korrigierter Interpunktion (Kommas, Punkte) und korrekter Schreibweise der Marken und Begriffe aus dem Brandnames-Hinweis. KEINE weiteren Änderungen an Wörtern oder Satzbau!
2. Extrahiere 3 SEO-Keywords (jeweils max. 2-3 Wörter, KEINE Nummerierung).

Korrektur-Hinweise:
- "Clothe", "clode", "clot" ersetze mit "Claude"
- "Superlo", "Superclo", "Superclode" ersetze mit "SuperClaude"
- "PAP", "PP" ersetze mit "PHP"
- "Sulo", "Solu" ersetze mit "Sulu"
- Wenn Transkript auf Englisch ist, bleibe auf Englisch

Formatiere so:

TRANSCRIPT:
[korrigierter Transkripttext]

KEYWORDS:
keyword1
keyword2
keyword3`;
  }

  static createPlatformMessage(
    platform: ChatPlatform,
    options: PlatformMessageOptions = {}
  ): string {
    switch (platform) {
      case "youtube":
        return this.youtubeMessage(options.videoDuration);
      case "linkedin":
        return this.linkedinMessage();
      case "twitter":
        return this.twitterMessage();
      case "instagram":
        return this.instagramMessage();
      case "tiktok":
        return this.tiktokMessage();
    }
  }

  private static youtubeMessage(videoDuration?: string): string {
    const timestamps = videoDuration
      ? `
3. GENAU 5 Zeitstempel (erster 0:00, letzter ${videoDuration}, gleichmäßig verteilt, Topics aus dem Transkript)

TIMESTAMPS:
[5 Zeitstempel im Format "0:00 Topic-Name"]`
      : "";

    return `Erstelle jetzt YouTube-Content basierend auf dem korrigierten Transkript und den Keywords:

1. SEO-optimierten Titel (60-70 Zeichen, Keyword am Anfang)
2. Sehr lange Beschreibung (ca. 1500 Zeichen, GENAU 3 ausführliche Absätze à 8-10 Sätze)${timestamps ? "\n" + timestamps.split("\n")[1] : ""}

Titel: Keyword am Anfang. VERBOTEN: "Meine Meinung zu...", negative Clickbait, (), &, #, !. Statt "&" immer "und"/"+" schreiben. Nie "Im Short zeige ich"/"Im Video". Ich-Perspektive. Englisch wenn Transkript englisch.

Beschreibung: Für Entwickler. Absatz 1: These mit Hauptkeyword am Anfang. Absatz 2: Argumente aus dem Transkript. Absatz 3: Community-Diskussion. NUR Inhalte aus dem Transkript, NICHTS erfinden.

TITLE:
[YouTube-Titel]

DESCRIPTION:
[3 Absätze]${timestamps}`;
  }

  private static linkedinMessage(): string {
    return `Erstelle jetzt einen LinkedIn-Post basierend auf dem korrigierten Transkript und den Keywords:

- 1000-1500 Zeichen, mit Absätzen
- Zielgruppe: Follower und Entscheider
- Ton: Spaß an Themen, helfe in Demos und Remote Workshops
- KEINE EMOJIS
- Keywords prominent integrieren
- Abschluss: Motivierende Frage
- 3-5 Hashtags am Ende
- NUR passende Tools/Technologien

LINKEDIN POST:
[LinkedIn-Post mit Hashtags]`;
  }

  private static twitterMessage(): string {
    return `Erstelle jetzt einen Twitter-Post basierend auf dem korrigierten Transkript:

- Max 280 Zeichen inkl. Hashtags
- Meinungsstark, diskussionsfördernd
- KEINE Emojis
- 1-2 Hashtags

TWITTER POST:
[Max 280 Zeichen]`;
  }

  private static instagramMessage(): string {
    return `Erstelle jetzt einen Instagram-Post basierend auf dem korrigierten Transkript:

- 500-800 Zeichen
- Persönlich, kurze Absätze
- KEINE Emojis
- GENAU 10 Hashtags: erste 3 MÜSSEN #nca #duisburg #ncatestify sein, 7 themenspezifisch

INSTAGRAM POST:
[Post mit 10 Hashtags]`;
  }

  private static tiktokMessage(): string {
    return `Erstelle jetzt einen TikTok-Post basierend auf dem korrigierten Transkript und den Keywords:

- 150-300 Zeichen (ohne Hashtags)
- Starker Hook in den ersten 10-15 Wörtern
- KEINE Emojis
- 3-6 Hashtags (deutsch + englisch Mix)

TIKTOK POST:
[Post mit Hashtags]`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- test/unit/chat-prompts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/chat-prompts.ts test/unit/chat-prompts.test.ts
git commit -m "feat: add chat-specific prompt templates for multi-turn generation"
```

---

## Chunk 3: Replace the API Endpoint

### Task 4: Replace `/api/generate` with chat-based workflow

**Files:**

- Replace: `src/pages/api/generate.ts`
- Delete: `src/pages/api/generate-from-video.ts`
- Delete: `src/utils/prompt-factory.ts`
- Modify: `src/config/prompts.ts` (keep only `GLOBAL_PROMPT_HELPERS`)

- [ ] **Step 1: Replace `src/pages/api/generate.ts` with the chat workflow**

```typescript
import type { APIRoute } from "astro";
import type { GenerateAllRequest, GenerateAllResponse } from "../../types/index.js";
import { validateTranscript, validateVideoDuration } from "../../utils/validation.js";
import { GoogleGeminiProvider } from "../../utils/ai-providers.js";
import { ChatPrompts } from "../../config/chat-prompts.js";
import { ResponseParser } from "../../utils/response-parser.js";

const GOOGLE_GEMINI_API_KEY = import.meta.env.GOOGLE_GEMINI_API_KEY;

let geminiProvider: GoogleGeminiProvider;

try {
  if (GOOGLE_GEMINI_API_KEY) {
    geminiProvider = new GoogleGeminiProvider(GOOGLE_GEMINI_API_KEY);
  }
} catch (error) {
  console.error("Failed to initialize AI provider:", error);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!geminiProvider) {
      return jsonResponse({ error: "AI-Dienste nicht verfügbar." }, 503);
    }

    const body = (await request.json()) as GenerateAllRequest;

    const transcriptError = validateTranscript(body.transcript);
    if (transcriptError) {
      return jsonResponse({ error: transcriptError }, 400);
    }

    if (body.videoDuration) {
      const durationError = validateVideoDuration(body.videoDuration);
      if (durationError) {
        return jsonResponse({ error: durationError }, 400);
      }
    }

    // Clean trailing single characters
    let transcript = body.transcript;
    const words = transcript.trim().split(/\s+/);
    if (words.length > 0) {
      const lastWord = words[words.length - 1];
      if (lastWord.length === 1 || /^[A-Za-z]\.$/.test(lastWord)) {
        words.pop();
        transcript = words.join(" ");
      }
    }

    // Start chat session — one session for all platforms
    geminiProvider.startChatSession();

    // Turn 1: Correct transcript + extract keywords
    const initialMessage = ChatPrompts.createInitialMessage(transcript);
    const { text: initialText, model } = await geminiProvider.sendChatMessage(initialMessage);

    const transcriptResult = ResponseParser.parseResponse("youtube", initialText);
    const keywordResult = ResponseParser.parseResponse("keywords", initialText);
    const correctedTranscript = transcriptResult.transcript || transcript;
    const keywords = keywordResult.keywords || [];

    // Turn 2: YouTube (title + description + timestamps)
    const ytMsg = ChatPrompts.createPlatformMessage("youtube", {
      videoDuration: body.videoDuration,
    });
    const { text: ytText } = await geminiProvider.sendChatMessage(ytMsg);
    const ytResult = ResponseParser.parseResponse("youtube", ytText);

    // Turn 3: LinkedIn
    const liMsg = ChatPrompts.createPlatformMessage("linkedin");
    const { text: liText } = await geminiProvider.sendChatMessage(liMsg);
    const liResult = ResponseParser.parseResponse("linkedin", liText);

    // Turn 4: Twitter
    const twMsg = ChatPrompts.createPlatformMessage("twitter");
    const { text: twText } = await geminiProvider.sendChatMessage(twMsg);
    const twResult = ResponseParser.parseResponse("twitter", twText);

    // Turn 5: Instagram
    const igMsg = ChatPrompts.createPlatformMessage("instagram");
    const { text: igText } = await geminiProvider.sendChatMessage(igMsg);
    const igResult = ResponseParser.parseResponse("instagram", igText);

    // Turn 6: TikTok
    const ttMsg = ChatPrompts.createPlatformMessage("tiktok");
    const { text: ttText } = await geminiProvider.sendChatMessage(ttMsg);
    const ttResult = ResponseParser.parseResponse("tiktok", ttText);

    const response: GenerateAllResponse = {
      correctedTranscript,
      keywords,
      youtube: {
        title: ytResult.title,
        description: ytResult.description,
        timestamps: ytResult.timestamps,
      },
      linkedin: { post: liResult.linkedinPost },
      twitter: { post: twResult.twitterPost },
      instagram: { post: igResult.instagramPost },
      tiktok: { post: ttResult.tiktokPost },
      modelUsed: model,
    };

    return jsonResponse(response);
  } catch (error: any) {
    console.error("Generate error:", error);
    return jsonResponse(
      { error: "Fehler bei der Content-Generierung.", details: error.message },
      500
    );
  }
};

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Delete `src/pages/api/generate-from-video.ts`**

```bash
git rm src/pages/api/generate-from-video.ts
```

- [ ] **Step 3: Delete `src/utils/prompt-factory.ts`**

```bash
git rm src/utils/prompt-factory.ts
```

- [ ] **Step 4: Strip `PLATFORM_PROMPTS` from `src/config/prompts.ts`**

Keep only `GLOBAL_PROMPT_HELPERS`. Remove the entire `PLATFORM_PROMPTS` export.

- [ ] **Step 5: Delete `test/unit/prompt-factory.test.ts`**

```bash
git rm test/unit/prompt-factory.test.ts
```

- [ ] **Step 6: Run all tests**

Run: `npm run test:unit`
Expected: PASS (some tests may need fixing if they import deleted modules)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: replace per-platform generation with single chat-based workflow"
```

---

## Chunk 4: Frontend — Single Action UX

### Task 5: Replace the API client

**Files:**

- Replace: `src/utils/api.ts`

- [ ] **Step 1: Replace `src/utils/api.ts` with single endpoint client**

```typescript
import type { GenerateAllRequest, GenerateAllResponse } from "../types/index.js";
import { ERROR_MESSAGES } from "../config/constants.js";

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public details?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function generateAllContent(
  transcript: string,
  options: { videoDuration?: string } = {}
): Promise<GenerateAllResponse> {
  const requestData: GenerateAllRequest = { transcript, ...options };

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.error || ERROR_MESSAGES.GENERATION_FAILED,
        response.status,
        errorData.details
      );
    }

    return (await response.json()) as GenerateAllResponse;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new ApiError(ERROR_MESSAGES.NETWORK_ERROR);
    }
    throw new ApiError(error instanceof Error ? error.message : ERROR_MESSAGES.GENERATION_FAILED);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/api.ts
git commit -m "feat: replace per-platform API client with single generateAllContent"
```

---

### Task 6: Simplify the app to single-action flow

**Files:**

- Modify: `src/utils/app.ts`

The new flow: user pastes transcript, optionally enters video duration, clicks one button. All results appear. Remove per-platform form submission logic, remove keyword detection as separate step (keywords come from the chat response).

- [ ] **Step 1: Rewrite `src/utils/app.ts`**

Replace the class with a simplified version:

```typescript
import { validateTranscript, validateVideoDuration } from "./validation.js";
import { generateAllContent, ApiError } from "./api.js";
import { ERROR_MESSAGES } from "../config/constants.js";
import {
  getElement,
  hideElement,
  showElement,
  setTextContent,
  displayError,
  hideError,
  copyToClipboard,
} from "./dom.js";

export class SocialMediaApp {
  private sharedTranscript!: HTMLTextAreaElement;
  private generateBtn!: HTMLButtonElement;
  private errorDiv!: HTMLElement;
  private errorMessage!: HTMLElement;

  constructor() {
    this.initializeElements();
    this.setupEventListeners();
  }

  private initializeElements(): void {
    this.sharedTranscript = getElement<HTMLTextAreaElement>("shared-transcript");
    this.generateBtn = getElement<HTMLButtonElement>("generate-btn");
    this.errorDiv = getElement("error");
    this.errorMessage = getElement("error-message");
  }

  private setupEventListeners(): void {
    this.generateBtn.addEventListener("click", () => this.handleGenerate());
    this.setupCopyListeners();
  }

  private async handleGenerate(): Promise<void> {
    const transcript = this.sharedTranscript.value;
    const transcriptError = validateTranscript(transcript);
    if (transcriptError) {
      displayError(this.errorDiv, this.errorMessage, transcriptError);
      return;
    }

    // Get optional video duration
    const durationInput = document.getElementById("video-duration") as HTMLInputElement | null;
    const videoDuration = durationInput?.value?.trim() || undefined;

    if (videoDuration) {
      const durationError = validateVideoDuration(videoDuration);
      if (durationError) {
        displayError(this.errorDiv, this.errorMessage, durationError);
        return;
      }
    }

    // Show loading
    this.generateBtn.disabled = true;
    setTextContent(this.generateBtn, "Generiert...");
    showElement(getElement("results-loading"));

    try {
      const data = await generateAllContent(transcript, { videoDuration });

      // Display corrected transcript
      setTextContent(getElement("transcript-content"), data.correctedTranscript);
      showElement(getElement("transcript-result"));

      // Display keywords as tags
      const keywordsContainer = getElement("keywords-display");
      keywordsContainer.innerHTML = data.keywords
        .map((kw) => `<span class="keyword-tag">${kw}</span>`)
        .join("");
      showElement(getElement("keywords-result"));

      // Display YouTube
      if (data.youtube.title) setTextContent(getElement("title-content"), data.youtube.title);
      if (data.youtube.description)
        setTextContent(getElement("description-content"), data.youtube.description);
      if (data.youtube.timestamps) {
        setTextContent(getElement("timestamps-content"), data.youtube.timestamps);
        showElement(getElement("timestamps-section"));
      }
      showElement(getElement("yt-result"));

      // Display other platforms
      if (data.linkedin.post) {
        setTextContent(getElement("linkedin-content-result"), data.linkedin.post);
        showElement(getElement("li-result"));
      }
      if (data.twitter.post) {
        setTextContent(getElement("twitter-content-result"), data.twitter.post);
        showElement(getElement("tw-result"));
      }
      if (data.instagram.post) {
        setTextContent(getElement("instagram-content-result"), data.instagram.post);
        showElement(getElement("ig-result"));
      }
      if (data.tiktok.post) {
        setTextContent(getElement("tiktok-content-result"), data.tiktok.post);
        showElement(getElement("tt-result"));
      }

      // Show model info
      setTextContent(getElement("model-used"), data.modelUsed);

      hideError(this.errorDiv);
      hideElement(getElement("results-loading"));
    } catch (error) {
      hideElement(getElement("results-loading"));
      const message = error instanceof ApiError ? error.message : ERROR_MESSAGES.GENERATION_FAILED;
      displayError(this.errorDiv, this.errorMessage, message);
    } finally {
      this.generateBtn.disabled = false;
      setTextContent(this.generateBtn, "Generieren");
    }
  }

  private setupCopyListeners(): void {
    const copyPairs = [
      ["copy-transcript-btn", "transcript-content"],
      ["copy-title-btn", "title-content"],
      ["copy-description-btn", "description-content"],
      ["copy-timestamps-btn", "timestamps-content"],
      ["copy-linkedin-btn", "linkedin-content-result"],
      ["copy-twitter-btn", "twitter-content-result"],
      ["copy-instagram-btn", "instagram-content-result"],
      ["copy-tiktok-btn", "tiktok-content-result"],
    ];

    copyPairs.forEach(([btnId, contentId]) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener("click", () => {
          const content = document.getElementById(contentId);
          if (content) copyToClipboard(content as HTMLElement, btn as HTMLElement);
        });
      }
    });
  }
}
```

- [ ] **Step 2: Remove now-unused imports and files**

Delete `src/utils/keywords.ts` and `src/utils/platform.ts` if they are no longer needed (the simplified app doesn't use `KeywordManager` or `PlatformManager`).

```bash
git rm src/utils/keywords.ts src/utils/platform.ts
```

- [ ] **Step 3: Run all tests, fix any broken imports**

Run: `npm run test:unit`
Fix any test files that import deleted modules.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: simplify app to single-action generate flow"
```

---

### Task 7: Update the Astro page template

**Files:**

- Modify: main `.astro` page (find with `find src -name "*.astro"`)

- [ ] **Step 1: Locate and simplify the page**

Replace the multi-step flow (transcript → keywords → per-platform forms) with:

```
┌──────────────────────────────────┐
│ Transkript [textarea]            │
│ Video-Dauer (optional) [input]   │
│ [Generieren] button              │
├──────────────────────────────────┤
│ Loading...                       │
├──────────────────────────────────┤
│ ✓ Korrigiertes Transkript [copy] │
│ ✓ Keywords: tag tag tag          │
├──────────────────────────────────┤
│ YouTube: Title [copy]            │
│          Description [copy]      │
│          Timestamps [copy]       │
├──────────────────────────────────┤
│ LinkedIn [copy]                  │
│ Twitter [copy]                   │
│ Instagram [copy]                 │
│ TikTok [copy]                   │
└──────────────────────────────────┘
```

Key UI elements needed:

- `id="shared-transcript"` — textarea
- `id="video-duration"` — input
- `id="generate-btn"` — button
- `id="results-loading"` — loading indicator (hidden by default)
- `id="transcript-result"` / `id="transcript-content"` — corrected transcript display
- `id="keywords-result"` / `id="keywords-display"` — keywords as tags
- All existing result/content IDs for platforms stay the same

- [ ] **Step 2: Test manually**

1. `npm run dev`
2. Paste transcript with errors ("clode code", "PAP")
3. Click "Generieren"
4. Verify: corrected transcript shows "Claude Code", "PHP"
5. Verify: all 5 platforms show results
6. Verify: copy buttons work

- [ ] **Step 3: Commit**

```bash
git add src/pages/
git commit -m "feat: simplify UI to single-action generate flow"
```

---

## Chunk 5: Cleanup and Verification

### Task 8: Remove dead code and old types

**Files:**

- Modify: `src/types/index.ts` — remove old `GenerateRequest`, `GenerateResponse` if unused
- Modify: `src/config/constants.ts` — remove unused constants

- [ ] **Step 1: Grep for old type/function usage**

```bash
grep -r "GenerateRequest\|GenerateResponse\|detectKeywords\|generateContent" src/ --include="*.ts" --include="*.astro"
```

Remove any types/functions that are no longer imported anywhere.

- [ ] **Step 2: Clean up `src/config/prompts.ts`**

Should only contain `GLOBAL_PROMPT_HELPERS`. If `PLATFORM_PROMPTS` was removed in Task 4, verify the file is clean.

- [ ] **Step 3: Run all tests**

Run: `npm run test:unit`
Expected: All PASS

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: remove dead code from old per-platform workflow"
```

---

## Token Savings Summary

| Metric                      | Old (6x generateContent)            | New (1x startChat + 6 turns) | Savings        |
| --------------------------- | ----------------------------------- | ---------------------------- | -------------- |
| Input tokens per run        | ~8,100                              | ~1,950                       | **76%**        |
| API HTTP requests           | 6                                   | 1                            | **83%**        |
| Brand names sent            | 6x (~2,400 tokens)                  | 1x (~400 tokens)             | **83%**        |
| Transcript sent             | 6x (~3,000 tokens)                  | 1x (~500 tokens)             | **83%**        |
| Corrected transcript        | Only YouTube, discarded             | All platforms use it         | **Bug fixed**  |
| Rate limit (RPM)            | 6                                   | 1                            | **83%**        |
| With Gemini context caching | N/A                                 | Turns 2-6 cached             | **~94% cost**  |
| UX steps                    | 3+ clicks (keywords → per-platform) | 1 click                      | **Simplified** |
