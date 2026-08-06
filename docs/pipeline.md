# Generation Pipeline

How a transcript becomes four platform posts, and the quality gates in between.

## Overview

```
raw transcript/video
   │
   ▼  turn 0 (video only)
ffmpeg → 16kHz mono WAV → Mistral Voxtral transcription  → raw spoken text
   │
   ▼  turn 1 (Ollama chat session)
createInitialMessage(transcript)              → {correctedTranscript, keywords[3]}
   │
   ▼  turns 2..5 (same chat session)
createPlatformMessage(platform, videoDuration?) → platform content
   │
   └─► Humanizer lint ──► one corrective retry ──► warnings surfaced if still dirty
```

## The chat session (`GenerationSession`)

One request = one `GenerationSession` = one Ollama chat session. The session exists because platforms build on shared context: brand vocabulary, corrected transcript, and keywords are established once in turn 1; each platform message is a **short follow-up** ("Erstelle jetzt einen LinkedIn-Post basierend auf dem korrigierten Transkript …"), not a self-contained prompt. This is what keeps multi-platform output consistent and cheap.

The class itself is deliberately stateless at module level: construct it per request with the configured provider.

```typescript
const session = new GenerationSession(createTextProvider(), emit?);
const { correctedTranscript, keywords } = await session.initialize(transcript);
for (const platform of ["youtube", "linkedin", "instagram", "tiktok"]) {
  const result = await session.generatePlatform(platform, transcript, { videoDuration });
}
```

`emit` is optional and receives progress events (`platform_started`, `humanizer_retry`, `platform_completed`) — the SSE routes forward these to the browser.

## Structured output

Every turn uses the OpenAI-compatible `response_format: {type: "json_schema"}` with strict schemas from `src/config/schemas.ts`. Ollama honors this via its structured-outputs layer; this guarantees parseable JSON per platform:

- turn 1: `{transcript, keywords}` (`maxItems: 3`)
- YouTube: `{title, description, timestamps?}` — timestamps key only exists when `videoDuration` was provided, enforced via `additionalProperties: false`
- LinkedIn / Instagram / TikTok: `{<platform>Post}`

## Quality gates

### Global prompt rules (`src/config/prompts.ts`)

Injected into turn 1 and effective for the whole session:

- **Brand names** — canonical spellings (Never Code Alone, AI Nights, OpenCode, PHPStan …) with explicit "not-X" variants to correct speech-to-text artifacts
- **Fact grounding** — no invented dates, numbers, quotes, places, or events; omit unknowns instead of fabricating
- **Anti-exaggeration** — bans "revolutionär", "Game-Changer", "disruptiv", …
- **Informal address** — "ihr/euch", developer-community tone
- **Humanizer** — German anti-AI-slop rules: no dashes of any kind, active over passive, concrete over abstract, no filler phrases, no triads-as-tics, no fake rhetorical questions

### Turn-1 correction hints

Explicit speech-to-text fixes, e.g. `"Clothe"/"clode" → Claude`, `"PAP" → PHP`, `"Open Code" → OpenCode`. Corrected output must change **only punctuation and brand spelling**, never word order.

### ResponseParser normalization

Mechanical cleanup on every parsed string field, independent of model behavior:

- All dash-like Unicode characters (hyphen, en/em dash, minus sign) → space, collapse doubles
- Hashtags lowercased in post fields

### Humanizer lint (`src/utils/humanizer-lint.ts`)

Deterministic post-generation validator. Three rule families:

- **Hard-block words** (16): any single occurrence blocks — e.g. "revolutionär", "bahnbrechend", "disruptiv", "Paradigmenwechsel"
- **Cluster rule** (Pattern 64): 3+ _distinct_ marker words ("spannend", "entscheidend", "nahtlos", "maßgeschneidert", …) or figurative phrases ("die digitale Landschaft") in one text = a cluster tell → blocks
- **Fake-analysis patterns** (Pattern 66): relative clauses like "was X unterstreicht/belegt/verdeutlicht", "und macht deutlich, wie wichtig …"

On a blocked result the pipeline **retries once inside the same chat session** with the forbidden words fed back verbatim, keeping facts and JSON shape. Then:

- clean retry → used silently
- partially cleaner retry → used, remaining words surfaced as `humanizerWarnings` (shown as an amber note on the card)
- no improvement / retry failed → original kept, warnings surfaced

### Transient errors

There is **no model fallback** — a single Ollama model (`OLLAMA_MODEL`, default `gpt-oss:20b`) serves all text generation. Transient 429/503 errors are retried inside the provider (`withRetry`, 3× exponential backoff). A persistent failure rethrows so the SSE route emits `platform_error` and continues with the remaining platforms.

## Error behavior

- A single platform erroring does **not** kill the pipeline: SSE emits `platform_error` and continues; the card gets a per-platform retry button
- A fatal failure (turn 1, provider outage) emits one `error` event; the UI shows the banner with "Neu starten"
- Validation errors (bad transcript, bad duration) return plain **400 JSON** _before_ the SSE stream starts — stream responses are only for actually running pipelines

## Why Ollama for text + Mistral Voxtral for audio

- **Ollama** (OpenAI-compatible) drives all text generation (transcript correction, keywords, per-platform posts) via `OLLAMA_API_KEY`. Use hosted Ollama Cloud or any compatible endpoint via `OLLAMA_BASE_URL`.
- **Mistral Voxtral** handles video audio transcription only (`MISTRAL_API_KEY`) — Ollama has no audio/transcription endpoint, so this stays on Mistral.
- The two boundaries are independent: if Voxtral fails, no chat session starts; if a chat call rate-limits, the provider retries — neither blocks the other's concern.
- ffmpeg is a system binary (Alpine package in the Docker image), not a cloud dependency — the audio extraction step runs entirely locally.
