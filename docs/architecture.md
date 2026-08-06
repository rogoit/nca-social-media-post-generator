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
│              (Ollama chat,                 (video → audio → text)
│               Humanizer lint)
└──────────────────────────────────────────────────────────────────┘
               │                                  │
               ▼                                  ▼
          Ollama API                      Mistral API (Voxtral)
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

1. User drops an MP4/MOV/WebM file (no size cap). No keyword step.
2. Frontend POSTs multipart to `/api/generate-from-video` (SSE).
3. Server: `ffmpeg` extracts audio to WAV → Mistral Voxtral transcribes → raw transcript; the video Buffer and temp WAV are discarded (never persisted to disk).
4. From here the flow is **identical** to the caption flow: same `GenerationSession`, same SSE event contract, same cards.

### Per-platform retry

An errored card calls `POST /api/generate` for exactly that platform — a plain JSON round trip, kept for targeted regeneration without re-running everything. When a `runId` is sent (resume context), the server restores the persisted chat history and does **not** re-run turn 1.

### Resume (refresh / SSE drop)

There is **no resume banner** — reload continues silently. `GenerationFeed`'s mount effect calls `loadPersistedRunOnMount()`:

1. localStorage `nca-run-id` → `GET /api/runs/:id`, falling back to `GET /api/runs/latest` (most recent run of **any** status, so completed runs rehydrate too).
2. `hydrateRun()` populates the store immediately — finished cards render with no click.
3. `missing` = platforms whose status isn't `ready`; if any exist, `resumeRun(id, missing)` is called **automatically** (no button): only the missing platforms are marked queued (ready cards preserved), and `POST /api/runs/:id/resume` (SSE) regenerates just those — turn 1 is skipped because the chat history is restored into a fresh `GenerationSession`. A `409` is a no-op; a stream failure marks the missing cards `error` (each retryable) without flipping the global stage.
4. The resume runs as a page-scoped SSE stream, not a detached server background task — closing the tab stops it, but save-points mean the next reload picks up where it left off.

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
| `run_started`      | `{runId, filename}`                                  | Run created (first event of every SSE stream)               |
| `transcript_done`  | `{transcript, keywords[], modelUsed}`                | Chat turn 1 finished                                        |
| `platform_started` | `{platform}`                                         | Generation for a platform begins                            |
| `humanizer_retry`  | `{platform}`                                         | Output triggered Humanizer lint; corrective retry in flight |
| `platform_done`    | `{platform, content, modelUsed, humanizerWarnings?}` | Platform content ready                                      |
| `platform_error`   | `{platform, message}`                                | One platform failed (pipeline continues)                    |
| `error`            | `{stage, message}`                                   | Fatal pipeline failure (stream ends)                        |
| `complete`         | `{modelUsed}`                                        | All platforms attempted                                     |

Both SSE endpoints (and `/api/runs/[id]/resume`) emit the identical contract — the frontend does not distinguish caption vs. video vs. resume after upload.

## Module map

- `src/pages/api/` — `generate.ts` (JSON), `generate-all.ts` (SSE), `generate-from-video.ts` (SSE), `runs/[id].ts` (GET), `runs/latest.ts` (GET), `runs/[id]/resume.ts` (SSE), `login.ts`, `logout.ts`
- `src/utils/generation-session.ts` — request-scoped chat session (see [pipeline.md](pipeline.md)); `restoreFrom()` skips turn 1 on resume
- `src/utils/persistence.ts` — facade over the runs repository (save-points, hydration, resume lookup)
- `db/schema.ts` — Drizzle schema (`runs`, `platform_results`)
- `db/client.ts` — libsql singleton + idempotent migrate-on-boot
- `db/runs-repository.ts` — typed CRUD (latest-run-only policy on `createRun`)
- `src/utils/ai-providers.ts` — `OllamaProvider` (chat, retry) + `createTextProvider()` factory
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

All state is **request-scoped**. Each incoming request constructs its own `GenerationSession` (with its own `OllamaProvider` via `createTextProvider()`). A past design cached chat state in module-level variables, which corrupted results under concurrent use — this history is why `generate.ts` deliberately holds no mutable module state.

## Data retention

Video bytes are never persisted — only the filename (as an identifier) and the generated text artifacts are. Every run is saved to SQLite (`db/`, Drizzle ORM + libsql, schema in `db/schema.ts`) so a browser refresh or SSE/network drop can resume it: the corrected transcript, chat message history, and per-platform results are rehydrated from the DB, and only the missing platforms are regenerated (turn 1 is never re-run). Only the latest run is kept — `createRun` wipes all prior runs and their platform results. The DB connection (`db/client.ts`) is a module-level singleton (infrastructure, not generation state); `GenerationSession` itself stays request-scoped.
