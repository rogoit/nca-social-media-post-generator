# Real AI Tests

Tests that make actual API calls to validate prompts and AI output quality.

## Setup

### 1. Get API key

**Mistral** (text generation + video transcription via Voxtral):

- Visit: https://console.mistral.ai/
- Create an API key under "API keys"

### 2. Set environment variables

```bash
export MISTRAL_API_KEY="your-key-here"
```

Or add to `.env` / `.env.local`:

```
MISTRAL_API_KEY=your-key-here
```

For the video transcription tests, `ffmpeg` must be installed and on PATH.

## Running Tests

```bash
# Run real tests only
npm run test:real

# Run a specific test file
npm run test:real -- real/prompt-validation.test.ts

# Provide keys ad hoc
GOOGLE_GEMINI_API_KEY=xxx MISTRAL_API_KEY=yyy npm run test:real # legacy; only MISTRAL_API_KEY needed now
```

## Test files

- `prompt-validation.test.ts` — validate prompt quality for each platform
- `response-parsing.test.ts` — test parsing of real AI responses
- `brand-detection.test.ts` — verify speech-to-text brand corrections (e.g. "AI Knights" → "AI Nights")
- `edge-cases.test.ts` — unusual inputs with real AI

## Important

- **Tests skip automatically if API keys are missing**
- **Costs money** — API usage charges apply; every test run makes real calls
- **Slower** — real network round trips (up to ~45s per test, configured in `vitest.config.ts`)
- **Rate limits** — runs may intermittently fail on 429s; retry with a pause

## Troubleshooting

**Tests skipped:**

- Check API keys are set and contain no quotes or stray whitespace

**Timeouts:**

- Increase the timeout in the test file or in `vitest.config.ts` (`testTimeout`)
- Check network connectivity and provider status pages

**API errors:**

- Verify key validity (Mistral rejects invalid keys with `Unauthorized`)
- Verify the account has credit/quota
- Mind provider rate limits, especially on free tiers
