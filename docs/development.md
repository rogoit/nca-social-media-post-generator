# Development

## Setup

```bash
npm install
cp .env.example .env   # if absent, create manually:
```

Required env vars (startup validation refuses to boot without them):

| Variable          | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| `EDITOR_ADMIN`    | Login username                                             |
| `EDITOR_PASSWORD` | Login password                                             |
| `MISTRAL_API_KEY` | Mistral key for video audio transcription via Voxtral only |
| `OLLAMA_API_KEY`  | Ollama key for all text generation (chat completions)      |

Optional:

| Variable            | Default                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `OLLAMA_MODEL`      | `gpt-oss:20b` — text-generation model                                |
| `OLLAMA_BASE_URL`   | `https://ollama.com/v1` — hosted Ollama, or your own endpoint        |
| `OLLAMA_TIMEOUT_MS` | `180000` — per-request timeout for a slow model (ms)                 |
| `DATABASE_PATH`     | `./data/nca.db` — SQLite file for persisted runs (resume on refresh) |

System dependencies:

- **ffmpeg** — required for the video upload flow (extracts audio before Voxtral transcription). Installed in the Docker image via `apk add ffmpeg`. For local dev, install via your package manager.

```bash
npm run dev    # http://localhost:4321
```

## Authentication

Single-editor cookie auth. `middleware.ts` guards everything except `/login`, `/api/login`, `/api/logout`: the cookie must equal `base64(EDITOR_ADMIN:EDITOR_PASSWORD)`. There's no session store, expiry, or rotation — the tool assumes a trusted single user behind it (see `docs/deployment.md` before exposing it anywhere).

## Project layout

```
src/
├── pages/index.astro        # static shell mounting islands
├── components/              # React islands (InputPanel, KeywordConfirm,
│                            #   GenerationFeed, ErrorBanner)
├── stores/generation-store.ts # nanostores state + SSE consumer + actions
├── pages/api/               # generate, generate-all, generate-from-video,
│                            #   runs/[id], runs/latest, runs/[id]/resume,
│                            #   login, logout
├── middleware.ts            # auth gate
├── config/                  # prompts, chat-prompts, schemas, constants
├── utils/                   # generation-session, ai-providers, sse,
│                            #   persistence, humanizer-lint, response-parser,
│                            #   validation
└── types/                   # shared TS types
db/                          # schema, client (libsql), migrate, runs-repository
docs/                        # this documentation
test/                        # unit / functional / real / utils
```

## Conventions

- Formatting: Prettier (`npm run format`), checked in CI. `prettier-plugin-astro` included
- Types: strict TS, no unnecessary `any` (API-route catch blocks use `unknown` + narrowing)
- Files kebab-case, functions camelCase, classes PascalCase, constants UPPER_SNAKE_CASE
- UI copy is German; dev docs/comments English; AI prompts German (product output is German)
- No persistence for video bytes: only the filename (as an identifier) and generated text artifacts are stored, never the uploaded video itself
- Persisted runs for resume: every run is saved to SQLite (`db/`, Drizzle + libsql) so a refresh or SSE/network drop resumes from the last save-point; only the latest run is kept

## Pre-commit checklist

```bash
npm run test:run     # all green
npm run type-check   # tsc strict + noUnusedLocals
npm run format       # prettier writes
```

If you touched anything in `config/prompts.ts` or `config/chat-prompts.ts`, also run the real-API tests: `npm run test:real`.

## Common tasks

- **Add a platform**: extend `SocialMediaPlatform` in `src/types/index.ts` → prompt in `chat-prompts.ts` → schema in `schemas.ts` → config entries in `constants.ts` → add to `PLATFORMS` in both SSE routes → card meta in `GenerationFeed.tsx` → tests.
- **Add a hard-block word**: `HARD_BLOCK_WORDS` in `humanizer-lint.ts` + a corpus-style test in `test/unit/humanizer-lint.test.ts`.
- **Change text model**: env var only (`OLLAMA_MODEL`), no code change. Voxtral transcription model is hardcoded in `TRANSCRIPTION_CONSTANTS`.
- **Adjust upload limits**: `validation.ts` + `InputPanel.tsx` constant `MAX_VIDEO_BYTES` + the dropzone hint copy.

## Frontend state

`generation-store.ts` stages: `idle → keywords → generating → done | error`. The video path skips `keywords`. Per-platform cards move `pending → humanizer? → ready | error` with an explicit retry action. Don't introduce component-local copies of server data — keep the store the single source and derive everything from `useStore(generationStore)`.
