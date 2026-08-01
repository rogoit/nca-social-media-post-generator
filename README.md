# Social Media Content Generator

A single-user tool that turns YouTube video transcripts (caption text) or uploaded short videos into ready-to-copy posts for **YouTube, LinkedIn, Instagram, and TikTok**.

## About the Project

This tool helps YouTube creators repurpose one piece of video content across social platforms. Feed it a transcript or a video and it produces:

1. A corrected transcript (punctuation and brand spellings fixed)
2. Three SEO keywords
3. Per-platform posts — YouTube title/description (plus optional timestamps), LinkedIn post, Instagram post, TikTok post — streamed live as each finishes

## Never Code Alone - Vibe Coding Example

This is a **Never Code Alone** consulting project demonstrating TDD (Test-Driven Development) with no human in the loop for "Vibe Coding" best practices.

This example project is created by **Roland Golla** ([rolandgolla.de](https://rolandgolla.de)) and relates to his 2025 developer keynote: [Vibe Coding](https://talks.nevercodealone.de/vibe-coding.html).

The project is under **MIT license** and open for contributions. You can support this project and help add new features to it.

## Technology Stack

- **Framework**: [Astro](https://astro.build/) (SSR, Node adapter) with [TailwindCSS](https://tailwindcss.com/) and [React islands](https://docs.astro.build/en/concepts/islands/) + [nanostores](https://github.com/nanostores/nanostores)
- **AI**: Mistral (Voxtral for video transcription + chat-based text generation with strict JSON schemas); ffmpeg for local audio extraction
- **Language**: TypeScript
- **Tests**: Vitest (unit / functional / real tiers)
- **CI/CD**: GitLab pipeline (test → docker build → deploy)

## Features

- **One page, two input paths**: paste a caption (desktop: keyword chips appear for confirmation) **or** drop a video (starts immediately — ideal on phones)
- **Auto-generation for all four platforms at once**: no per-platform buttons; live per-card progress bars via Server-Sent Events
- **Copy buttons** on every output block (YouTube title/description/timestamps; one per other platform)
- **Transcript correction**: fixes punctuation and speech-to-text brand errors (e.g. "AI Knights" → "AI Nights", "Clothe" → Claude), never rewrites wording
- **Content quality gate**: Humanizer lint detects German AI-slop patterns in output and triggers one corrective retry inside the same chat; remaining issues surface as visible warnings on the card
- **Model fallback**: on Mistral 503/429 the chat restarts on the next configured model and retries, keeping session context
- **Privacy by design**: videos are processed in memory only — never written to disk; nothing is persisted server-side

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd social-media-post-generator
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure API keys in `.env` (required keys are validated at startup):

   ```
   EDITOR_ADMIN=your-login-name
   EDITOR_PASSWORD=your-login-password
   MISTRAL_API_KEY=your-key-here
   ```

   Optional model overrides (comma-separated, tried in order):

   ```
   MISTRAL_MODELS=mistral-large-latest,mistral-small-latest
   ```

   Keys:
   - **Mistral**: [Mistral console](https://console.mistral.ai/) → API keys section (drives text generation AND video transcription via Voxtral)
   - **ffmpeg**: system binary, needed only for the video upload flow. Installed in the Docker image; for local dev install via your package manager.

4. Start the development server:
   ```bash
   npm run dev
   ```

## Usage

1. Log in with the credentials from your `.env`.
2. **Desktop (have a caption)**: paste the transcript → click _Keywords erkennen_ → adjust the up-to-3 keyword chips, optionally enter the video duration (`MM:SS`) for YouTube timestamps → _Bestätigen und alle Plattformen generieren_.
3. **Phone (only have the video)**: drop an MP4/MOV/WebM file (≤ 100 MB) → _Content generieren_. Keywords are skipped; generation starts immediately.
4. Watch the per-platform progress bars fill: YouTube, LinkedIn, Instagram, TikTok. Each card activates its copy buttons as soon as its content is ready — errors can be retried per platform without restarting the rest.
5. Paste each block into YouTube Studio / LinkedIn / Instagram / TikTok.

## Documentation

Developer documentation lives in **[docs/](docs/README.md)** — architecture, pipeline internals, API reference, testing strategy, deployment, and history.

## License

[MIT](LICENSE)
