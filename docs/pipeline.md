# Generation Pipeline

How a transcript becomes four platform posts, and the quality gates in between.

## Overview

```
raw transcript/video
   │
   ▼  turn 0 (video only)
Gemini extractTranscript()                    → raw spoken text
   │
   ▼  turn 1 (Mistral chat session)
createInitialMessage(transcript)              → {correctedTranscript, keywords[3]}
   │
   ▼  turns 2..5 (same chat session)
createPlatformMessage(platform, videoDuration?) → platform content
   │
   ├─► Humanizer lint ──► one corrective retry ──► warnings surfaced if still dirty
   └─► on 503/429: restart chat on next Mistral model, retry once
```

## The chat session (`GenerationSession`)

One request = one `GenerationSession` = one Mistral chat session. The session exists because platforms build on shared context: brand vocabulary, corrected transcript, and keywords are established once in turn 1; each platform message is a **short follow-up** ("Erstelle jetzt einen LinkedIn-Post basierend auf dem korrigierten Transkript …"), not a self-contained prompt. This is what keeps multi-platform output consistent and cheap.

The class itself is deliberately stateless at module level: construct it per request with your Mistral API key.

```typescript
const session = new GenerationSession(MISTRAL_API_KEY, emit?);
const { correctedTranscript, keywords } = await session.initialize(transcript);
for (const platform of ["youtube", "linkedin", "instagram", "tiktok"]) {
  const result = await session.generatePlatform(platform, transcript, { videoDuration });
}
```

`emit` is optional and receives progress events (`platform_started`, `humanizer_retry`, `platform_completed`, `model_fallback`) — the SSE routes forward these to the browser.

## Structured output

Every turn uses Mistral's `response_format: {type: "json_schema"}` with strict schemas from `src/config/schemas.ts`. This guarantees parseable JSON per platform:

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

### Model fallback

Configured via `MISTRAL_MODELS=primary,secondary` (comma-separated). If a platform call dies with 503/429 after the provider's internal retries, the session restarts on the next model and re-runs turn 1 to restore context, then retries the platform once. Emits `model_fallback` so the UI shows which model landed.

## Error behavior

- A single platform erroring does **not** kill the pipeline: SSE emits `platform_error` and continues; the card gets a per-platform retry button
- A fatal failure (turn 1, provider outage) emits one `error` event; the UI shows the banner with "Neu starten"
- Validation errors (bad transcript, bad duration, oversized video) return plain **400 JSON** _before_ the SSE stream starts — stream responses are only for actually running pipelines

## Why Mistral for text, Gemini for video?

- Gemini handles raw media natively (inline video bytes) and is good at transcription.
- Mistral provides strict `json_schema` output over multi-turn chat, which the whole platform loop depends on; its models handle German marketing-adjacent copy well.
- The two boundaries are independent: if Gemini fails, no Mistral call happens; if Mistral rate-limits, the pipeline falls back across `MISTRAL_MODELS` without re-touching Gemini.
