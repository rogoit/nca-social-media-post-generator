# Video Upload & Auto-Generation Flow Design

## Overview

End-to-end flow: User uploads a vertical video (max 1 min, 1080p) in the browser. The app extracts a transcript via Gemini, generates platform-specific social media posts, and sends approved posts + video to n8n for distribution.

## Architecture: Ansatz C

**Astro-App = Content-Generierung, n8n = Distribution.** Clear separation of concerns.

## User Flow

```
Video Upload → Gemini Transcript → Keywords → Content generieren (pro Plattform)
→ Review-Screen (pro Plattform einzeln freigeben/neu generieren)
→ Freigegebene an n8n-Webhook senden
```

## UI

### Two Modes (Tabs)

- **Tab 1: Video Upload** — new, primary mode
- **Tab 2: Transcript Input** — existing functionality preserved

### Video Upload Tab

1. Drag & Drop area + File-Picker button
2. Accepts: MP4, MOV, WebM — max 100 MB, max 1 min, vertical (1080p)
3. Video preview after upload

### Processing State

Progress indicator with steps:

- "Transcript wird extrahiert..."
- "Keywords werden erkannt..."
- "Content wird generiert..."

### Platform Approval Screen

Cards per platform, each with:

- Platform-specific generated content (title, description, caption, hashtags)
- Video preview
- **Freigeben** button (approve for sending)
- **Neu generieren** button (re-generate content for this platform only)

Platforms:

- **YouTube**: Title, Description, Tags
- **LinkedIn**: Post-Text
- **Instagram**: Caption, Hashtags
- **TikTok**: Caption, Hashtags

### Send Action

"Senden" button — sends only approved platforms to n8n webhook.

## Backend

### New API Routes

#### `POST /api/generate-from-video`

1. Receive video via multipart upload, save as temp file
2. Upload video to Gemini File API
3. Extract transcript via Gemini 2.5 Pro with video reference
4. Run existing flow: keyword detection → transcript correction → content generation
5. Generate platform-specific content (YouTube, LinkedIn, Instagram, TikTok)
6. Return all generated content to frontend
7. Clean up temp file

#### `POST /api/send-to-n8n`

1. Receive approved platforms + content from frontend
2. POST to n8n webhook with payload:
   ```json
   {
     "video": "<base64 or file reference>",
     "platforms": {
       "youtube": { "title": "...", "description": "...", "tags": [...] },
       "linkedin": { "text": "..." },
       "instagram": { "caption": "...", "hashtags": [...] },
       "tiktok": { "caption": "...", "hashtags": [...] }
     },
     "transcript": "...",
     "keywords": [...]
   }
   ```

### Gemini Integration

- Use Gemini File API for video upload (supports up to 2GB)
- `generateContent` call with video reference + transcript extraction prompt
- Extend existing `ai-providers.ts` with `extractTranscript(videoFile)` function
- Reuse existing `GOOGLE_GEMINI_API_KEY`

### Platform-Specific Prompts

Each platform gets tailored prompts in `src/config/prompts.ts`:

- YouTube: SEO title, detailed 3-paragraph description, relevant tags
- LinkedIn: Professional post with engagement hooks
- Instagram: Visual caption, trending + niche hashtags
- TikTok: Short punchy caption, viral hashtags

## Configuration

New environment variable:

- `N8N_WEBHOOK_URL` — endpoint for n8n distribution workflow

## Constraints

- Video: MP4/MOV/WebM, max 100 MB, max 1 min, 1080p vertical
- No editing of generated content — only review and re-generate
- n8n workflow (receiving side) is out of scope for this design

## Tech Stack

- Existing: Astro, TailwindCSS, Google Gemini, Vitest
- New: Gemini File API for video processing
- No new dependencies expected (Gemini SDK already included)
