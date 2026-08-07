# Persistence & Resume

## Goal

A browser refresh or SSE/network drop during generation must not restart the pipeline from scratch. The corrected transcript, chat history, and any already-finished platforms are recovered from the database, and only the missing platforms are regenerated — turn 1 (transcript correction + keywords) is never re-run on resume.

## What is and isn't persisted

| Persisted                                 | Not persisted                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| Uploaded **filename** (as identifier)     | Uploaded **video bytes** (request-scoped Buffer, discarded after ffmpeg) |
| Raw transcript (Voxtral output)           | Temp WAV file (cleaned up after transcription)                           |
| Corrected transcript (turn 1)             |                                                                          |
| Keywords                                  |                                                                          |
| Chat message history (Ollama turns)       |                                                                          |
| Per-platform content + humanizer warnings |                                                                          |
| Model used, video duration, run status    |                                                                          |

## Storage

SQLite via `@libsql/client` (pure JS — no native build, works on the Alpine Docker image) + Drizzle ORM. Single file at `DATABASE_PATH` (default `./data/nca.db`, `/app/data/nca.db` in the container). The connection (`db/client.ts`) is a module-level singleton — this is infrastructure (a connection pool), not generation/chat state, so it is correct to share it. `GenerationSession` itself stays request-scoped. WAL is intentionally **off** — Docker's `overlay2` storage driver rejects WAL's mmap/`-shm` with `SQLITE_IOERR`, so SQLite uses its default DELETE journal (plain file I/O, works on any filesystem).

Schema lives in `db/schema.ts`; DDL is applied idempotently on boot via `db/migrate.ts` (`CREATE TABLE IF NOT EXISTS`) — no drizzle-kit migration step required.

## Schema

```
runs
  id               TEXT PK  (server UUID)
  filename         TEXT
  inputSource      TEXT     ('caption' | 'video')
  status           TEXT     ('running' | 'partial' | 'done' | 'error')
  rawTranscript    TEXT?
  correctedTranscript TEXT?
  keywords         TEXT?    (JSON string[])
  chatHistory      TEXT?    (JSON [{role,content}])
  model            TEXT?
  videoDuration    TEXT?
  errorMessage     TEXT?
  createdAt        INTEGER
  updatedAt        INTEGER

platform_results
  runId            TEXT FK→runs.id ON DELETE CASCADE
  platform         TEXT
  status           TEXT     ('pending' | 'ready' | 'error')
  content          TEXT?    (JSON GenerateResponse partial)
  model            TEXT?
  humanizerWarnings TEXT?   (JSON string[])
  errorMessage     TEXT?
  updatedAt        INTEGER
  PK (runId, platform)
```

## Save-points

The pipeline writes to the DB at these points (all tiny, synchronous-ish libsql calls):

| #   | Trigger                                       | Action                                                                  |
| --- | --------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Run start (before SSE body, after validation) | `createRun` (wipes prior runs) + emit `run_started {runId, filename}`   |
| 2   | After `GenerationSession.initialize()`        | `persistTurn1` raw + corrected transcript, keywords, chatHistory, model |
| 3   | After each `platform_done`                    | `persistPlatformResult` status='ready' + content/model/warnings         |
| 4   | After each `platform_error`                   | `persistPlatformResult` status='error' + message                        |
| 5   | Loop end                                      | `finishRun` status='done' (all 4 ready) or 'partial'                    |
| 6   | Fatal catch                                   | `finishRun` status='error' + message                                    |

## Latest-run-only policy

`createRun` deletes all prior `runs` rows first (cascade removes their `platform_results`). This is a single-user tool with no history UI, so only the most recent run is kept. This keeps the DB tiny and the resume lookup unambiguous.

## Resume flow

There is **no resume banner** — reload just continues where it left off, silently.

1. **On page load**, `GenerationFeed`'s mount effect calls `loadPersistedRunOnMount()`:
   - reads `localStorage["nca-run-id"]` → `GET /api/runs/:id`, falling back to `GET /api/runs/latest` (most recent run of **any** status — completed runs included, so finished work reappears).
   - if the run has a corrected transcript → `hydrateRun()` **immediately** populates the store, so finished cards render with no click.
2. The platform states are inspected: `missing` = platforms whose status isn't `ready`.
3. If `missing.length > 0` → `resumeRun(id, missing)` is called **automatically**:
   - only the missing platforms are marked `queued` (ready cards are preserved);
   - `POST /api/runs/:id/resume` (SSE) regenerates just those platforms — turn 1 is skipped because the chat history is restored into a fresh `GenerationSession`;
   - a `409` ("nothing to resume" / "no history") is treated as success, not an error;
   - on a stream-level failure, the missing platforms are marked `error` (each offers its own retry) — the finished cards stay visible and the global stage is **not** flipped to error.
4. If the run is already complete → nothing else happens; the finished posts just show.

The resume runs as an SSE stream tied to the page request, **not** a detached server-side background task. Closing the tab stops it, but the save-points mean the next reload picks up wherever it left off.

## Endpoints

| Method | Route                  | Purpose                                                                            |
| ------ | ---------------------- | ---------------------------------------------------------------------------------- |
| `GET`  | `/api/runs/:id`        | Full run + platform results (hydration)                                            |
| `GET`  | `/api/runs/latest`     | Most recent run of any status (404 if none)                                        |
| `POST` | `/api/runs/:id/resume` | SSE: regenerate missing platforms (404 unknown, 409 no history / already complete) |

All are behind the existing `middleware.ts` auth gate (logged-in editor only).

## Single-platform retry

`retryPlatform()` now sends the persisted `runId` to `/api/generate`. When present, the server restores the chat history and skips turn 1 — a targeted retry no longer pays the full turn-1 cost. When `runId` is absent, it falls back to a fresh `initialize()`.

## Failure modes handled

- **Browser refresh mid-run**: localStorage + `/api/runs/latest` finds the run; ready cards render, missing ones regenerate.
- **SSE/network drop**: the server-side request aborts, but the last save-point is already in the DB; the client reconnects via resume.
- **Server restart**: the SQLite file (mounted volume) survives; on next request the run is resumable. (Not a primary requirement, but covered for free.)
