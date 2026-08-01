# Documentation

Social Media Content Generator — single-user tool that turns a YouTube transcript (caption text) or an uploaded video into platform-ready posts for **YouTube, LinkedIn, Instagram, and TikTok** using Mistral (Voxtral for video transcription, chat-based text generation with content-quality gates) and ffmpeg for local audio extraction.

## Guides

| Document                             | Content                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)   | System overview, request flows (caption vs. video), SSE event contract, module map  |
| [pipeline.md](pipeline.md)           | Generation pipeline: chat session, Humanizer lint, model fallback, prompt structure |
| [api-reference.md](api-reference.md) | All endpoints with request/response and SSE event payloads                          |
| [testing.md](testing.md)             | 3-tier test strategy, how to run, TDD workflow, what goes where                     |
| [development.md](development.md)     | Setup, environment variables, code conventions, pre-commit checklist                |
| [deployment.md](deployment.md)       | Docker image, GitLab CI stages, runtime env, startup validation                     |

## History

`plans/` holds dated design/implementation plans. Several describe the removed n8n distribution and approval-screen flow — they are kept for context and marked as superseded in their headers.

## Reading order for newcomers

1. `architecture.md` — the shape of the whole thing (10 min)
2. `development.md` — get it running locally
3. `testing.md` — how to change it without breaking
4. `pipeline.md` + `api-reference.md` — reference, consult as needed
