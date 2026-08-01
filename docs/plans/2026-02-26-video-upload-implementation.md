> **Superseded (2026-08):** the n8n distribution step, per-platform approval screen, and Twitter platform described here were removed in the pipeline revamp. See `../README.md` and `../architecture.md` for the current design. Kept for historical context.

# Video Upload & Auto-Generation Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a video upload mode that extracts transcripts via Gemini, generates platform-specific social media posts, lets the user approve per-platform, and sends approved posts + video to an n8n webhook.

**Architecture:** New "Video Upload" tab alongside existing "Transcript Input" on index.astro. Video is uploaded to a new API route, sent to Gemini File API for transcript extraction, then processed through the existing content generation pipeline for all 4 platforms (YouTube, LinkedIn, Instagram, TikTok). Results appear as per-platform cards with Approve/Regenerate controls. Approved platforms are POSTed to an n8n webhook.

**Tech Stack:** Astro (SSR with Node adapter), Google Gemini File API + generateContent, TailwindCSS, vanilla JavaScript, Vitest

---

### Task 1: Add video validation utility

**Files:**

- Modify: `src/utils/validation.ts`
- Test: `test/unit/validation.test.ts`

**Step 1: Write the failing test**

Add to `test/unit/validation.test.ts`:

```typescript
import { validateVideoFile } from "../../src/utils/validation.js";

describe("validateVideoFile", () => {
  it("should accept valid video files", () => {
    expect(validateVideoFile({ name: "video.mp4", size: 50_000_000, type: "video/mp4" })).toBe(
      null
    );
  });

  it("should reject files over 100MB", () => {
    expect(validateVideoFile({ name: "big.mp4", size: 150_000_000, type: "video/mp4" })).toContain(
      "100 MB"
    );
  });

  it("should reject non-video mime types", () => {
    expect(validateVideoFile({ name: "doc.pdf", size: 1000, type: "application/pdf" })).toContain(
      "MP4, MOV, WebM"
    );
  });

  it("should accept MOV files", () => {
    expect(
      validateVideoFile({ name: "video.mov", size: 50_000_000, type: "video/quicktime" })
    ).toBe(null);
  });

  it("should accept WebM files", () => {
    expect(validateVideoFile({ name: "video.webm", size: 50_000_000, type: "video/webm" })).toBe(
      null
    );
  });

  it("should reject null input", () => {
    expect(validateVideoFile(null as any)).toContain("Video");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/validation.test.ts --reporter=verbose`
Expected: FAIL — `validateVideoFile` is not exported

**Step 3: Write minimal implementation**

Add to `src/utils/validation.ts`:

```typescript
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB

export function validateVideoFile(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (!file) {
    return "Bitte wähle eine Video-Datei aus.";
  }

  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return "Ungültiges Format. Erlaubt sind: MP4, MOV, WebM.";
  }

  if (file.size > MAX_VIDEO_SIZE) {
    return "Die Datei ist zu groß. Maximal 100 MB erlaubt.";
  }

  return null;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/validation.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/validation.ts test/unit/validation.test.ts
git commit -m "feat: add video file validation utility"
```

---

### Task 2: Add Gemini video transcript extraction

**Files:**

- Modify: `src/utils/ai-providers.ts`
- Modify: `src/config/constants.ts`
- Test: `test/unit/ai-providers-video.test.ts`

**Step 1: Write the failing test**

Create `test/unit/ai-providers-video.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { GoogleGeminiProvider } from "../../src/utils/ai-providers.js";

// We test the interface — the actual Gemini call is mocked in functional tests
describe("GoogleGeminiProvider.extractTranscript", () => {
  it("should have an extractTranscript method", () => {
    // Can't construct without valid key, but we can check the prototype
    expect(typeof GoogleGeminiProvider.prototype.extractTranscript).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/ai-providers-video.test.ts --reporter=verbose`
Expected: FAIL — `extractTranscript` does not exist

**Step 3: Write minimal implementation**

Add to `src/config/constants.ts` after the existing constants:

```typescript
export const VIDEO_CONSTANTS = {
  MAX_SIZE_BYTES: 100 * 1024 * 1024,
  ALLOWED_TYPES: ["video/mp4", "video/quicktime", "video/webm"] as const,
  TRANSCRIPT_PROMPT: `Extrahiere das gesprochene Wort aus diesem Video als vollständiges Transkript.
Gib NUR den gesprochenen Text zurück, ohne Zeitstempel, ohne Formatierung, ohne Erklärungen.
Nur der reine gesprochene Text als durchgehender Fließtext.`,
} as const;
```

Add to `src/utils/ai-providers.ts` — extend `GoogleGeminiProvider` class. Add this method inside the class and update the import:

```typescript
// At the top, add import:
import { AI_MODELS, VIDEO_CONSTANTS } from "../config/constants.js";

// Inside GoogleGeminiProvider class, add method:
async extractTranscript(videoBuffer: Buffer, mimeType: string): Promise<{ text: string; model: string }> {
  const errors: AIError[] = [];

  for (const model of this.models) {
    try {
      const genModel = this.genAI.getGenerativeModel({ model });
      const videoData = {
        inlineData: {
          data: videoBuffer.toString("base64"),
          mimeType,
        },
      };
      const result = await genModel.generateContent([VIDEO_CONSTANTS.TRANSCRIPT_PROMPT, videoData]);
      const response = await result.response;
      const text = response.text();
      return { text, model };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";
      const errorStatus = (error as { status?: number }).status;
      errors.push({ provider: this.name, message: errorMessage, status: errorStatus });
      console.error(`Video transcript extraction failed with ${model}:`, errorMessage);
    }
  }

  throw new Error(`${this.name} video transcript extraction failed: ${errors.map((e) => e.message).join(", ")}`);
}
```

Also add `extractTranscript` to the `AIProvider` interface:

```typescript
export interface AIProvider {
  readonly name: string;
  readonly models: readonly string[];
  generateContent(prompt: string): Promise<{ text: string; model: string }>;
  extractTranscript?(
    videoBuffer: Buffer,
    mimeType: string
  ): Promise<{ text: string; model: string }>;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/ai-providers-video.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/ai-providers.ts src/config/constants.ts test/unit/ai-providers-video.test.ts
git commit -m "feat: add Gemini video transcript extraction method"
```

---

### Task 3: Create the video upload API route

**Files:**

- Create: `src/pages/api/generate-from-video.ts`
- Test: `test/functional/generate-from-video.test.ts`

**Step 1: Write the failing test**

Create `test/functional/generate-from-video.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("generate-from-video API route", () => {
  it("should export a POST handler", async () => {
    const module = await import("../../src/pages/api/generate-from-video.js");
    expect(typeof module.POST).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/functional/generate-from-video.test.ts --reporter=verbose`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/pages/api/generate-from-video.ts`:

```typescript
import type { APIRoute } from "astro";
import { validateVideoFile } from "../../utils/validation.js";
import { AIProviderManager, GoogleGeminiProvider } from "../../utils/ai-providers.js";
import { PromptFactory } from "../../utils/prompt-factory.js";
import { ResponseParser } from "../../utils/response-parser.js";

const GOOGLE_GEMINI_API_KEY = import.meta.env.GOOGLE_GEMINI_API_KEY;

let aiProviderManager: AIProviderManager;
let geminiProvider: GoogleGeminiProvider;

try {
  if (GOOGLE_GEMINI_API_KEY) {
    geminiProvider = new GoogleGeminiProvider(GOOGLE_GEMINI_API_KEY);
    aiProviderManager = new AIProviderManager([geminiProvider]);
  }
} catch (error) {
  console.error("Failed to initialize AI providers for video:", error);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!aiProviderManager || !geminiProvider) {
      return jsonResponse({ error: "AI-Dienste nicht verfügbar." }, 503);
    }

    // Parse multipart form data
    const formData = await request.formData();
    const videoFile = formData.get("video") as File | null;

    if (!videoFile) {
      return jsonResponse({ error: "Keine Video-Datei gefunden." }, 400);
    }

    // Validate video file
    const validationError = validateVideoFile({
      name: videoFile.name,
      size: videoFile.size,
      type: videoFile.type,
    });
    if (validationError) {
      return jsonResponse({ error: validationError }, 400);
    }

    // Convert File to Buffer for Gemini
    const arrayBuffer = await videoFile.arrayBuffer();
    const videoBuffer = Buffer.from(arrayBuffer);

    // Step 1: Extract transcript from video via Gemini
    const { text: transcript, model: transcriptModel } = await geminiProvider.extractTranscript(
      videoBuffer,
      videoFile.type
    );

    // Step 2: Detect keywords
    const keywordPrompt = PromptFactory.createPrompt("keywords", transcript);
    const { text: keywordText } = await aiProviderManager.generateContent(keywordPrompt);
    const keywordResult = ResponseParser.parseResponse("keywords", keywordText);
    const keywords = keywordResult.keywords || [];

    // Step 3: Generate content for all platforms in parallel
    const platforms = ["youtube", "linkedin", "instagram", "tiktok"] as const;
    const results: Record<string, any> = {};

    const platformPromises = platforms.map(async (platform) => {
      const prompt = PromptFactory.createPrompt(platform, transcript, { keywords });
      const { text, model } = await aiProviderManager.generateContent(prompt);
      const parsed = ResponseParser.parseResponse(platform, text);
      results[platform] = { ...parsed, modelUsed: model };
    });

    await Promise.all(platformPromises);

    return jsonResponse({
      transcript,
      transcriptModel,
      keywords,
      platforms: results,
    });
  } catch (error: any) {
    console.error("Video generation error:", error);
    return jsonResponse(
      { error: "Fehler bei der Video-Verarbeitung.", details: error.message },
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

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/functional/generate-from-video.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/pages/api/generate-from-video.ts test/functional/generate-from-video.test.ts
git commit -m "feat: add video upload API route with transcript extraction"
```

---

### Task 4: Create the n8n webhook sender API route

**Files:**

- Create: `src/pages/api/send-to-n8n.ts`
- Test: `test/functional/send-to-n8n.test.ts`

**Step 1: Write the failing test**

Create `test/functional/send-to-n8n.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("send-to-n8n API route", () => {
  it("should export a POST handler", async () => {
    const module = await import("../../src/pages/api/send-to-n8n.js");
    expect(typeof module.POST).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/functional/send-to-n8n.test.ts --reporter=verbose`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/pages/api/send-to-n8n.ts`:

```typescript
import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  const N8N_WEBHOOK_URL = import.meta.env.N8N_WEBHOOK_URL;

  if (!N8N_WEBHOOK_URL) {
    return jsonResponse({ error: "N8N_WEBHOOK_URL ist nicht konfiguriert." }, 503);
  }

  try {
    const body = await request.json();
    const { platforms, video, transcript, keywords } = body;

    if (!platforms || Object.keys(platforms).length === 0) {
      return jsonResponse({ error: "Keine Plattformen zum Senden ausgewählt." }, 400);
    }

    // Forward the approved platforms + video to n8n
    const payload = {
      video, // base64 encoded video
      transcript,
      keywords,
      platforms,
    };

    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text().catch(() => "Unknown error");
      return jsonResponse({ error: "n8n-Webhook fehlgeschlagen.", details: errorText }, 502);
    }

    const n8nData = await n8nResponse.json().catch(() => ({}));
    return jsonResponse({ success: true, n8nResponse: n8nData });
  } catch (error: any) {
    console.error("n8n send error:", error);
    return jsonResponse({ error: "Fehler beim Senden an n8n.", details: error.message }, 500);
  }
};

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/functional/send-to-n8n.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/pages/api/send-to-n8n.ts test/functional/send-to-n8n.test.ts
git commit -m "feat: add n8n webhook sender API route"
```

---

### Task 5: Add N8N_WEBHOOK_URL to env config

**Files:**

- Modify: `astro.config.mjs`

**Step 1: Add the env var to the config**

In `astro.config.mjs`, add `N8N_WEBHOOK_URL` to the destructured env vars:

```javascript
const {
  EDITOR_ADMIN,
  EDITOR_PASSWORD,
  GOOGLE_GEMINI_API_KEY,
  GOOGLE_GEMINI_MODELS,
  N8N_WEBHOOK_URL,
} = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
Object.assign(process.env, {
  EDITOR_ADMIN,
  EDITOR_PASSWORD,
  GOOGLE_GEMINI_API_KEY,
  GOOGLE_GEMINI_MODELS,
  N8N_WEBHOOK_URL,
});
```

**Step 2: Run existing tests to make sure nothing broke**

Run: `npx vitest run test/unit test/functional --reporter=verbose`
Expected: All existing tests PASS

**Step 3: Commit**

```bash
git add astro.config.mjs
git commit -m "feat: add N8N_WEBHOOK_URL to env config"
```

---

### Task 6: Build the Video Upload UI — Tab system on index.astro

**Files:**

- Modify: `src/pages/index.astro`

**Step 1: Add tab navigation at the top of the form**

Replace the opening of `index.astro` content (after `<div class="bg-white p-6 rounded-lg shadow-md">`) with a two-tab system. Wrap the existing content in a `div#tab-transcript` and add a new `div#tab-video`:

```html
<!-- Input Mode Tabs -->
<div class="flex border-b border-gray-200 mb-6">
  <button
    id="mode-transcript-tab"
    class="px-6 py-2 font-medium border-b-2 border-indigo-600 text-indigo-600 rounded-t-md"
  >
    Transkript eingeben
  </button>
  <button
    id="mode-video-tab"
    class="px-6 py-2 font-medium text-gray-500 hover:text-indigo-600 rounded-t-md"
  >
    Video hochladen
  </button>
</div>

<!-- Tab: Transcript Input (existing flow) -->
<div id="tab-transcript-content">
  <!-- ALL existing content from step-transcript through step-social -->
</div>

<!-- Tab: Video Upload (new flow) -->
<div id="tab-video-content" class="hidden">
  <!-- Video Upload Area -->
  <div id="video-upload-area" class="mb-6">
    <div
      id="video-dropzone"
      class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
    >
      <p class="text-gray-500 mb-2">Video hierher ziehen oder klicken zum Auswählen</p>
      <p class="text-xs text-gray-400">MP4, MOV, WebM — max 100 MB, max 1 Min, 1080p vertikal</p>
      <input
        type="file"
        id="video-file-input"
        accept="video/mp4,video/quicktime,video/webm"
        class="hidden"
      />
    </div>
    <!-- Video Preview -->
    <div id="video-preview-container" class="hidden mt-4">
      <video id="video-preview" class="w-full max-h-64 rounded-lg bg-black" controls></video>
      <button
        type="button"
        id="video-remove-btn"
        class="mt-2 text-sm text-red-600 hover:text-red-800"
      >
        Video entfernen
      </button>
    </div>
  </div>

  <!-- Generate Button -->
  <button
    type="button"
    id="video-generate-btn"
    class="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
    disabled
  >
    Content generieren
  </button>

  <!-- Progress Steps -->
  <div id="video-progress" class="hidden mt-6">
    <div class="space-y-3">
      <div id="progress-transcript" class="flex items-center text-gray-400">
        <div
          class="w-6 h-6 mr-3 rounded-full border-2 border-gray-300 flex items-center justify-center text-xs"
        >
          1
        </div>
        <span>Transkript wird extrahiert...</span>
      </div>
      <div id="progress-keywords" class="flex items-center text-gray-400">
        <div
          class="w-6 h-6 mr-3 rounded-full border-2 border-gray-300 flex items-center justify-center text-xs"
        >
          2
        </div>
        <span>Keywords werden erkannt...</span>
      </div>
      <div id="progress-content" class="flex items-center text-gray-400">
        <div
          class="w-6 h-6 mr-3 rounded-full border-2 border-gray-300 flex items-center justify-center text-xs"
        >
          3
        </div>
        <span>Content wird generiert...</span>
      </div>
    </div>
  </div>

  <!-- Platform Approval Cards -->
  <div id="platform-approval" class="hidden mt-6 space-y-4">
    <!-- YouTube Card -->
    <div id="approval-youtube" class="border border-gray-200 rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-medium text-red-600">YouTube</h3>
        <div class="flex space-x-2">
          <button
            type="button"
            class="regenerate-btn px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            data-platform="youtube"
          >
            Neu generieren
          </button>
          <button
            type="button"
            class="approve-btn px-3 py-1 text-sm text-white bg-green-600 rounded-md hover:bg-green-700"
            data-platform="youtube"
          >
            Freigeben
          </button>
        </div>
      </div>
      <div class="space-y-2 text-sm">
        <div>
          <span class="font-medium">Titel:</span>
          <span id="approval-yt-title" class="text-gray-700"></span>
        </div>
        <div>
          <span class="font-medium">Beschreibung:</span>
          <p id="approval-yt-description" class="text-gray-700 whitespace-pre-line mt-1"></p>
        </div>
      </div>
    </div>

    <!-- LinkedIn Card -->
    <div id="approval-linkedin" class="border border-gray-200 rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-medium text-blue-600">LinkedIn</h3>
        <div class="flex space-x-2">
          <button
            type="button"
            class="regenerate-btn px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            data-platform="linkedin"
          >
            Neu generieren
          </button>
          <button
            type="button"
            class="approve-btn px-3 py-1 text-sm text-white bg-green-600 rounded-md hover:bg-green-700"
            data-platform="linkedin"
          >
            Freigeben
          </button>
        </div>
      </div>
      <div id="approval-li-post" class="text-sm text-gray-700 whitespace-pre-line"></div>
    </div>

    <!-- Instagram Card -->
    <div id="approval-instagram" class="border border-gray-200 rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-medium text-pink-600">Instagram</h3>
        <div class="flex space-x-2">
          <button
            type="button"
            class="regenerate-btn px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            data-platform="instagram"
          >
            Neu generieren
          </button>
          <button
            type="button"
            class="approve-btn px-3 py-1 text-sm text-white bg-green-600 rounded-md hover:bg-green-700"
            data-platform="instagram"
          >
            Freigeben
          </button>
        </div>
      </div>
      <div id="approval-ig-post" class="text-sm text-gray-700 whitespace-pre-line"></div>
    </div>

    <!-- TikTok Card -->
    <div id="approval-tiktok" class="border border-gray-200 rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-medium text-black">TikTok</h3>
        <div class="flex space-x-2">
          <button
            type="button"
            class="regenerate-btn px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            data-platform="tiktok"
          >
            Neu generieren
          </button>
          <button
            type="button"
            class="approve-btn px-3 py-1 text-sm text-white bg-green-600 rounded-md hover:bg-green-700"
            data-platform="tiktok"
          >
            Freigeben
          </button>
        </div>
      </div>
      <div id="approval-tt-post" class="text-sm text-gray-700 whitespace-pre-line"></div>
    </div>

    <!-- Send to n8n Button -->
    <button
      type="button"
      id="send-to-n8n-btn"
      class="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
      disabled
    >
      Freigegebene an n8n senden
    </button>
  </div>
</div>
```

**Step 2: Run the build to make sure the template compiles**

Run: `npx astro build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: add video upload tab UI with platform approval cards"
```

---

### Task 7: Build the Video Upload client-side logic

**Files:**

- Create: `src/scripts/video-upload.js`
- Modify: `src/scripts/main.js`

**Step 1: Create the video upload script**

Create `src/scripts/video-upload.js`:

```javascript
import {
  getElement,
  hideElement,
  showElement,
  setTextContent,
  displayError,
  hideError,
  ApiError,
} from "./utils.js";

export class VideoUploadApp {
  constructor() {
    this.videoFile = null;
    this.videoBase64 = null;
    this.generatedData = null;
    this.approvedPlatforms = new Set();
    this.initializeElements();
    this.setupEventListeners();
  }

  initializeElements() {
    // Tabs
    this.modeTranscriptTab = getElement("mode-transcript-tab");
    this.modeVideoTab = getElement("mode-video-tab");
    this.tabTranscriptContent = getElement("tab-transcript-content");
    this.tabVideoContent = getElement("tab-video-content");

    // Video upload
    this.videoDropzone = getElement("video-dropzone");
    this.videoFileInput = getElement("video-file-input");
    this.videoPreviewContainer = getElement("video-preview-container");
    this.videoPreview = getElement("video-preview");
    this.videoRemoveBtn = getElement("video-remove-btn");
    this.videoGenerateBtn = getElement("video-generate-btn");

    // Progress
    this.videoProgress = getElement("video-progress");
    this.progressTranscript = getElement("progress-transcript");
    this.progressKeywords = getElement("progress-keywords");
    this.progressContent = getElement("progress-content");

    // Platform approval
    this.platformApproval = getElement("platform-approval");
    this.sendToN8nBtn = getElement("send-to-n8n-btn");

    // Error
    this.errorDiv = getElement("error");
    this.errorMessage = getElement("error-message");
  }

  setupEventListeners() {
    // Tab switching
    this.modeTranscriptTab.addEventListener("click", () => this.switchTab("transcript"));
    this.modeVideoTab.addEventListener("click", () => this.switchTab("video"));

    // Video dropzone
    this.videoDropzone.addEventListener("click", () => this.videoFileInput.click());
    this.videoDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.videoDropzone.classList.add("border-indigo-500", "bg-indigo-50");
    });
    this.videoDropzone.addEventListener("dragleave", () => {
      this.videoDropzone.classList.remove("border-indigo-500", "bg-indigo-50");
    });
    this.videoDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      this.videoDropzone.classList.remove("border-indigo-500", "bg-indigo-50");
      const file = e.dataTransfer.files[0];
      if (file) this.handleVideoSelect(file);
    });

    // File input
    this.videoFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) this.handleVideoSelect(file);
    });

    // Remove video
    this.videoRemoveBtn.addEventListener("click", () => this.removeVideo());

    // Generate
    this.videoGenerateBtn.addEventListener("click", () => this.handleGenerate());

    // Approve/Regenerate buttons
    document.querySelectorAll(".approve-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const platform = e.target.dataset.platform;
        this.approvePlatform(platform);
      });
    });

    document.querySelectorAll(".regenerate-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const platform = e.target.dataset.platform;
        this.regeneratePlatform(platform);
      });
    });

    // Send to n8n
    this.sendToN8nBtn.addEventListener("click", () => this.sendToN8n());
  }

  switchTab(mode) {
    if (mode === "transcript") {
      showElement(this.tabTranscriptContent);
      hideElement(this.tabVideoContent);
      this.modeTranscriptTab.classList.add("border-b-2", "border-indigo-600", "text-indigo-600");
      this.modeTranscriptTab.classList.remove("text-gray-500");
      this.modeVideoTab.classList.remove("border-b-2", "border-indigo-600", "text-indigo-600");
      this.modeVideoTab.classList.add("text-gray-500");
    } else {
      hideElement(this.tabTranscriptContent);
      showElement(this.tabVideoContent);
      this.modeVideoTab.classList.add("border-b-2", "border-indigo-600", "text-indigo-600");
      this.modeVideoTab.classList.remove("text-gray-500");
      this.modeTranscriptTab.classList.remove("border-b-2", "border-indigo-600", "text-indigo-600");
      this.modeTranscriptTab.classList.add("text-gray-500");
    }
  }

  handleVideoSelect(file) {
    const allowedTypes = ["video/mp4", "video/quicktime", "video/webm"];
    if (!allowedTypes.includes(file.type)) {
      displayError(
        this.errorDiv,
        this.errorMessage,
        "Ungültiges Format. Erlaubt sind: MP4, MOV, WebM."
      );
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      displayError(
        this.errorDiv,
        this.errorMessage,
        "Die Datei ist zu groß. Maximal 100 MB erlaubt."
      );
      return;
    }

    this.videoFile = file;
    this.videoPreview.src = URL.createObjectURL(file);
    showElement(this.videoPreviewContainer);
    hideElement(this.videoDropzone);
    this.videoGenerateBtn.disabled = false;
    hideError(this.errorDiv);
  }

  removeVideo() {
    if (this.videoPreview.src) {
      URL.revokeObjectURL(this.videoPreview.src);
    }
    this.videoFile = null;
    this.videoBase64 = null;
    this.videoPreview.src = "";
    hideElement(this.videoPreviewContainer);
    showElement(this.videoDropzone);
    this.videoGenerateBtn.disabled = true;
    this.videoFileInput.value = "";
    hideElement(this.platformApproval);
    hideElement(this.videoProgress);
  }

  setProgressStep(step) {
    const steps = [this.progressTranscript, this.progressKeywords, this.progressContent];
    steps.forEach((s, i) => {
      if (i < step) {
        s.classList.remove("text-gray-400");
        s.classList.add("text-green-600");
      } else if (i === step) {
        s.classList.remove("text-gray-400");
        s.classList.add("text-indigo-600");
      } else {
        s.classList.remove("text-green-600", "text-indigo-600");
        s.classList.add("text-gray-400");
      }
    });
  }

  async handleGenerate() {
    if (!this.videoFile) return;

    this.videoGenerateBtn.disabled = true;
    showElement(this.videoProgress);
    hideElement(this.platformApproval);
    hideError(this.errorDiv);
    this.approvedPlatforms.clear();
    this.updateSendButton();

    try {
      this.setProgressStep(0);

      const formData = new FormData();
      formData.append("video", this.videoFile);

      const response = await fetch("/api/generate-from-video", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Fehler bei der Video-Verarbeitung.");
      }

      this.setProgressStep(2);
      const data = await response.json();
      this.generatedData = data;

      // Store video as base64 for n8n
      const reader = new FileReader();
      reader.onload = () => {
        this.videoBase64 = reader.result.split(",")[1];
      };
      reader.readAsDataURL(this.videoFile);

      // Display results
      this.displayPlatformResults(data);
      this.setProgressStep(3);
      showElement(this.platformApproval);
    } catch (error) {
      displayError(this.errorDiv, this.errorMessage, error.message);
      console.error("Video generation error:", error);
    } finally {
      this.videoGenerateBtn.disabled = false;
    }
  }

  displayPlatformResults(data) {
    const platforms = data.platforms;

    // YouTube
    if (platforms.youtube) {
      setTextContent(getElement("approval-yt-title"), platforms.youtube.title || "");
      setTextContent(getElement("approval-yt-description"), platforms.youtube.description || "");
    }

    // LinkedIn
    if (platforms.linkedin) {
      setTextContent(getElement("approval-li-post"), platforms.linkedin.linkedinPost || "");
    }

    // Instagram
    if (platforms.instagram) {
      setTextContent(getElement("approval-ig-post"), platforms.instagram.instagramPost || "");
    }

    // TikTok
    if (platforms.tiktok) {
      setTextContent(getElement("approval-tt-post"), platforms.tiktok.tiktokPost || "");
    }

    // Reset all approval states
    document.querySelectorAll(".approve-btn").forEach((btn) => {
      btn.textContent = "Freigeben";
      btn.classList.remove("bg-gray-400");
      btn.classList.add("bg-green-600");
    });
  }

  approvePlatform(platform) {
    this.approvedPlatforms.add(platform);
    const btn = document.querySelector(`.approve-btn[data-platform="${platform}"]`);
    if (btn) {
      btn.textContent = "Freigegeben";
      btn.classList.remove("bg-green-600");
      btn.classList.add("bg-gray-400");
    }
    this.updateSendButton();
  }

  async regeneratePlatform(platform) {
    if (!this.generatedData) return;

    this.approvedPlatforms.delete(platform);
    this.updateSendButton();

    const card = getElement(`approval-${platform}`);
    card.classList.add("opacity-50");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: this.generatedData.transcript,
          type: platform,
          keywords: this.generatedData.keywords,
        }),
      });

      if (!response.ok) {
        throw new Error("Regenerierung fehlgeschlagen.");
      }

      const data = await response.json();
      this.generatedData.platforms[platform] = { ...data, modelUsed: data.modelUsed };

      // Update the card content
      this.displaySinglePlatformResult(platform, data);
    } catch (error) {
      displayError(this.errorDiv, this.errorMessage, error.message);
    } finally {
      card.classList.remove("opacity-50");
    }
  }

  displaySinglePlatformResult(platform, data) {
    switch (platform) {
      case "youtube":
        setTextContent(getElement("approval-yt-title"), data.title || "");
        setTextContent(getElement("approval-yt-description"), data.description || "");
        break;
      case "linkedin":
        setTextContent(getElement("approval-li-post"), data.linkedinPost || "");
        break;
      case "instagram":
        setTextContent(getElement("approval-ig-post"), data.instagramPost || "");
        break;
      case "tiktok":
        setTextContent(getElement("approval-tt-post"), data.tiktokPost || "");
        break;
    }

    // Reset approve button
    const btn = document.querySelector(`.approve-btn[data-platform="${platform}"]`);
    if (btn) {
      btn.textContent = "Freigeben";
      btn.classList.remove("bg-gray-400");
      btn.classList.add("bg-green-600");
    }
  }

  updateSendButton() {
    this.sendToN8nBtn.disabled = this.approvedPlatforms.size === 0;
  }

  async sendToN8n() {
    if (!this.generatedData || this.approvedPlatforms.size === 0) return;

    this.sendToN8nBtn.disabled = true;
    setTextContent(this.sendToN8nBtn, "Wird gesendet...");

    try {
      const approvedData = {};
      for (const platform of this.approvedPlatforms) {
        approvedData[platform] = this.generatedData.platforms[platform];
      }

      const response = await fetch("/api/send-to-n8n", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: approvedData,
          video: this.videoBase64,
          transcript: this.generatedData.transcript,
          keywords: this.generatedData.keywords,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Fehler beim Senden an n8n.");
      }

      setTextContent(this.sendToN8nBtn, "Erfolgreich gesendet!");
      setTimeout(() => {
        setTextContent(this.sendToN8nBtn, "Freigegebene an n8n senden");
        this.sendToN8nBtn.disabled = false;
      }, 3000);
    } catch (error) {
      displayError(this.errorDiv, this.errorMessage, error.message);
      setTextContent(this.sendToN8nBtn, "Freigegebene an n8n senden");
      this.sendToN8nBtn.disabled = false;
    }
  }
}
```

**Step 2: Update main.js to initialize both apps**

Modify `src/scripts/main.js`:

```javascript
import { SocialMediaApp } from "./app.js";
import { VideoUploadApp } from "./video-upload.js";

// Initialize the application when the DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new SocialMediaApp();
  new VideoUploadApp();
});
```

**Step 3: Run the build to verify**

Run: `npx astro build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/scripts/video-upload.js src/scripts/main.js
git commit -m "feat: add video upload client-side logic with platform approval flow"
```

---

### Task 8: Run all tests and verify

**Files:** None (verification only)

**Step 1: Run all unit and functional tests**

Run: `npx vitest run test/unit test/functional --reporter=verbose`
Expected: All tests PASS

**Step 2: Run type check**

Run: `npm run type-check`
Expected: No errors

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit any fixes if needed**

---

### Task 9: Update README

**Files:**

- Modify: `README.md`

**Step 1: Add Video Upload feature to README**

Add a new section under "## Features":

```markdown
- **Video Upload**: Upload a video file (MP4, MOV, WebM up to 100 MB) and automatically extract transcript via Gemini
- **Multi-Platform Generation**: Generates optimized content for YouTube, LinkedIn, Instagram, and TikTok simultaneously
- **Platform Approval**: Review and approve/regenerate content per platform before publishing
- **n8n Integration**: Send approved content + video to n8n webhook for automated distribution
```

Add under "## Installation" step 3:

```markdown
     N8N_WEBHOOK_URL=your-n8n-webhook-url
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README with video upload feature"
```
