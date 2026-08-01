# Testing

## Tiers

```
test/
├── unit/         Pure functions, fully mocked, fast (<100ms each)
├── functional/   Route/workflow tests with mocked AI HTTP calls
├── real/         Live API tests against Gemini/Mistral (manual runs only)
└── utils/        Shared mocks and fixtures
```

## Commands

```bash
npm run test:unit        # unit only — during development
npm run test:functional  # functional only
npm run test:run         # unit + functional — before commit / in CI
npm run test:all         # everything incl. real
npm run test:real        # real API tests (costs tokens, requires keys)
npm run test:coverage    # coverage report (threshold 70% global)
npm run test:ui          # vitest UI
```

Vitest config (`vitest.config.ts`) uses **projects**: `unit-functional` (jsdom) and `real` (node, 4 workers, 45s timeout). `MISTRAL_API_KEY` and model lists are injected into the test env with safe mocks; real keys for `test/real/` come from `.env`.

## What goes where

- **Unit**: prompt builders, Humanizer lint, response parser, validation, schemas, store event handling, GenerationSession logic with mocked `fetch`
- **Functional**: full API route behavior — request validation, SSE event contract, error statuses, per-platform error continuation. Mock the network, assert wire behavior. Never mock internals of the route itself.
- **Real**: brand-correction behavior and prompt quality that only live AI can validate (e.g. "AI Knights → AI Nights" correction). Run manually before/after prompt changes; not part of CI.

## Adding a feature (TDD workflow)

Full version: the repository's own `development.md` (root) describes the red/green/refactor loop in detail. Short version:

1. Write the failing test in the right tier; run only that file: `npx vitest run test/unit/foo.test.ts`
2. Implement the minimal change; loop until green
3. Run the full suite once: `npm run test:run`
4. `npm run type-check && npm run format` before committing

## Conventions

- **Don't modify existing passing tests** to make a change fit — they are the regression contract
- New platform content behavior → unit test on the prompt + parser, functional test on the route's SSE events
- New env config → update `vitest.config.ts` test `env` map, otherwise `import.meta.env` is empty in tests
- Flaky real-API assertions belong in `test/real/`, never in unit/functional (the mock world must be deterministic)

### Mocking notes

- Global `fetch` is stubbed per-file via `vi.stubGlobal("fetch", ...)` and responses queued with `mockImplementationOnce`
- The chat-based provider accumulates history — tests that trigger fallbacks/retries must also account for the extra turn-1 re-run call
- The provider's retry backoff is injectable: `session.provider.retryBaseDelayMs = 1` in tests (production default 2000ms)

## Debugging a red test

- SSE route tests: `readSseEvents()` in `test/functional/generate-sse.test.ts` parses the stream — reuse it
- "Invalid model: undefined" → an env var resolved to the literal string `"undefined"`; see the note on env copying in `docs/architecture.md` (this bug existed once, it's worth knowing the symptom)
- jsdom `File` lacks `arrayBuffer()` — shim it in the test (see `generate-sse.test.ts:videoFormRequest`)
