# Architecture

## System overview

```
┌────────────────────────────────────────────────────────────────┐
│                        Browser (React islands)                  │
│  InputPanel ──► KeywordConfirm ──► GenerationFeed ──► ErrorBanner│
│        └──────────── nanostores generation-store ◄─────────────┘
└──────────────┬───────────────────────────────────┬─────────────┘
               │ JSON (keywords)                    │ SSE (generation)
               ▼                                    ▼
┌─────────────────────────── Astro SSR (Node adapter) ───────────────────────────┐
│ middleware.ts: cookie auth (editor-auth, base64 admin:password)                 │
│                                                                                 │
│  POST /api/generate            POST /api/generate-all   POST /api/generate-from-video
│  (JSON: keywords stage +       (SSE: caption flow)      (SSE: video flow)
│   per-platform retry)                 │                        │
│        └────────────┬─────────────────┴──────────┬────────────┘
│                     ▼                            ▼
│              GenerationSession          ffmpeg → Voxtral
│              (Mistral chat,                 (video → audio → text)
│               Humanizer lint,
│               model fallback)
└──────────────────────────────────────────────────────────────────┘
               │                                  │
               ▼                                  ▼
         Mistral API                      Mistral API (Voxtral)
```

## Request flows

### Caption flow (typical desktop use)

1. User pastes a YouTube transcript into the caption textarea → `detectKeywords()`.
2. Frontend calls `POST /api/generate` with `type: "keywords"`. Server runs chat turn 1 (correction + keywords) and returns JSON `{keywords, transcriptCleaned, modelUsed}`.
3. User edits keywords (max 3), optionally sets video duration (for YouTube timestamps), confirms.
4. Frontend calls `POST /api/generate-all` (SSE). Server streams the full pipeline:
   - Turn 1 re-runs in one session (so regeneration context matches)
   - `transcript_done` → corrected transcript + keywords
   - For each of YouTube, LinkedIn, Instagram, TikTok: `platform_started` → (`humanizer_retry` optional) → `platform_done` | `platform_error`
   - `complete`
5. Each card's copy buttons activate when its `platform_done` arrives.

### Video flow (typical phone use)

1. User drops an MP4/MOV/WebM file (≤100 MB). No keyword step.
2. Frontend POSTs multipart to `/api/generate-from-video` (SSE).
3. Server: `ffmpeg` extracts audio to WAV → Mistral Voxtral transcribes → raw transcript; the video Buffer and temp WAV are discarded (never persisted to disk).
4. From here the flow is **identical** to the caption flow: same `GenerationSession`, same SSE event contract, same cards.

### Per-platform retry

An errored card calls `POST /api/generate` for exactly that platform — a plain JSON round trip, kept for targeted regeneration without re-running everything.

## Frontend islands

The page is a static shell (`index.astro`, ~30 lines) plus four React islands sharing one nanostores store:

| Island               | client directive | Purpose                                                              |
| -------------------- | ---------------- | -------------------------------------------------------------------- |
| `InputPanel.tsx`     | `client:load`    | Caption textarea OR video dropzone (auto-branch, mutually exclusive) |
| `KeywordConfirm.tsx` | `client:visible` | 3-chip keyword editor + confirm — only rendered in `keywords` stage  |
| `GenerationFeed.tsx` | `client:load`    | 4 platform cards with progress bar + copy buttons                    |
| `ErrorBanner.tsx`    | `client:load`    | Pipeline-level error display with reset                              |

The store (`src/stores/generation-store.ts`) is the single source of truth: stage, input source, raw transcript, corrected transcript, keywords, per-platform card state. Actions (`detectKeywords`, `startCaptionGeneration`, `startVideoGeneration`, `retryPlatform`, `reset`) perform network I/O and dispatch SSE events into the store.

## SSE event contract

Wire format: `event: <name>\ndata: <json>\n\n` over `text/event-stream`.

| Event              | Payload                                              | Emitted when                                                |
| ------------------ | ---------------------------------------------------- | ----------------------------------------------------------- |
| `transcript_done`  | `{transcript, keywords[], modelUsed}`                | Chat turn 1 finished                                        |
| `platform_started` | `{platform}`                                         | Generation for a platform begins                            |
| `humanizer_retry`  | `{platform}`                                         | Output triggered Humanizer lint; corrective retry in flight |
| `platform_done`    | `{platform, content, modelUsed, humanizerWarnings?}` | Platform content ready                                      |
| `platform_error`   | `{platform, message}`                                | One platform failed (pipeline continues)                    |
| `model_fallback`   | `{model}`                                            | Chat restarted on next Mistral model after 503/429          |
| `error`            | `{stage, message}`                                   | Fatal pipeline failure (stream ends)                        |
| `complete`         | `{modelUsed}`                                        | All platforms attempted                                     |

Both SSE endpoints emit the identical contract — the frontend does not distinguish caption vs. video after upload.

## Module map

- `src/pages/api/` — `generate.ts` (JSON), `generate-all.ts` (SSE), `generate-from-video.ts` (SSE), `login.ts`, `logout.ts`
- `src/utils/generation-session.ts` — request-scoped chat session (see [pipeline.md](pipeline.md))
- `src/utils/ai-providers.ts` — `MistralProvider` (chat, retry, fallback-aware)
- `src/utils/transcriber.ts` — Voxtral audio transcription (Mistral audio API)
- `src/utils/audio-extraction.ts` — ffmpeg video→WAV extraction (temp dir, request-scoped)
- `src/utils/sse.ts` — `SseStream` wire formatting + response headers
- `src/utils/humanizer-lint.ts` — German AI-slop detector (hard-block words, cluster threshold, fake-analysis patterns)
- `src/utils/response-parser.ts` — JSON parse + dash/hashtag normalization
- `src/config/chat-prompts.ts` — turn prompts (initial + per platform)
- `src/config/prompts.ts` — global rules: brand spellings, fact grounding, anti-exaggeration, Humanizer vocabulary
- `src/config/schemas.ts` — strict `json_schema` response formats per platform
- `src/config/constants.ts` — platforms, limits, model lists (env-overridable)
- `src/middleware.ts` — cookie auth gate

## Concurrency model

All state is **request-scoped**. Each incoming request constructs its own `GenerationSession` (and its own `MistralProvider`). A past design cached chat state in module-level variables, which corrupted results under concurrent use — this history is why `generate.ts` deliberately holds no mutable module state.

## Data retention

Nothing is persisted. Videos exist only as request-scoped Buffers. Generated text lives in the browser session (nanostores). Refreshing the page discards everything — acceptable for a single-user copy-into-platform workflow.
