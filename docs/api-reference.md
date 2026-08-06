# API Reference

Base URL: same origin. All routes except `/api/login` and `/api/logout` require the `editor-auth` cookie (see [development.md](development.md#authentication)).

## POST /api/generate

JSON endpoint. Keyword detection, per-platform regeneration, per-platform retry.

**Request**

```json
{
  "transcript": "string, required",
  "type": "youtube | linkedin | instagram | tiktok | keywords   (default: youtube)",
  "videoDuration": "MM:SS, optional",
  "runId": "string, optional — restore chat history from this persisted run (skip turn 1)"
}
```

**Responses**

- `type: "keywords"` → `{keywords: string[], transcriptCleaned: boolean, modelUsed: string}`
- platforms → merged platform content:
  - youtube: `{title, description, transcript, timestamps?, transcriptCleaned, modelUsed, humanizerWarnings?}`
  - linkedin/instagram/tiktok: `{<type>Post, transcriptCleaned, modelUsed, humanizerWarnings?}`
- Errors: `400` invalid request, `502` invalid AI content, `503` providers unavailable, `500` unexpected. All as `{error, details?}`.

## POST /api/generate-all

SSE endpoint (caption flow). Streams all four platforms from one transcript.

**Request** JSON: `{transcript: string, videoDuration?: "MM:SS"}`.

**Response** `200 text/event-stream` streaming [events](#sse-events), or early `4xx` JSON when validation fails before streaming starts.

## POST /api/generate-from-video

SSE endpoint (video flow). `multipart/form-data`:

| Field           | Type                             | Required |
| --------------- | -------------------------------- | -------- |
| `video`         | File (MP4/MOV/WebM, no size cap) | ✓        |
| `videoDuration` | `MM:SS`                          | optional |

**Response** `200 text/event-stream` after the transcript is extracted. Same [event contract](#sse-events) as `/api/generate-all`. Fatal video-extraction failure appears as one `error` event. Early-validation failures (`400`) are JSON.

### SSE events

```
event: run_started         data: {"runId":"uuid","filename":"clip.mp4"}
event: transcript_done
data: {"transcript":"...","keywords":["A","B","C"],"modelUsed":"mistral-large-latest"}

event: platform_started    data: {"platform":"youtube"}
event: humanizer_retry     data: {"platform":"youtube"}
event: model_fallback      data: {"model":"mistral-small-latest"}

event: platform_done
data: {"platform":"youtube",
       "content":{ /* platform payload */ },
       "modelUsed":"mistral-large-latest",
       "humanizerWarnings":["Revolutionär"]?}

event: platform_error      data: {"platform":"linkedin","message":"..."}
event: error               data: {"stage":"pipeline","message":"..."}
event: complete            data: {"modelUsed":"..."}
```

`run_started` is always the first event of every SSE stream and carries the `runId` the frontend persists to localStorage for resume. Platform `content` shapes mirror the `/api/generate` response fields (YouTube includes `title`, `description`, optionally `timestamps`, and `transcript`). Client-side parsing lives at `handleSseEvent()` in `src/stores/generation-store.ts`.

## GET /api/runs/:id

Returns the full persisted run (for hydration after refresh). `200` with the run + `platformResults` array, `404` when not found. See [persistence.md](persistence.md) for the shape.

## GET /api/runs/latest

Returns the most recent run of any status (so a reload rehydrates finished work too); `404` when none exists.

## POST /api/runs/:id/resume

SSE endpoint. Restores the chat history from the persisted run (turn 1 is **not** re-run) and regenerates only the platforms whose status is not `ready`. Emits the same [event contract](#sse-events) as `/api/generate-all`.

**Responses** `200 text/event-stream`, or JSON `404` (unknown run), `409` (no restorable chat history, or run already complete).

## POST /api/login

`{username, password}` → sets the `editor-auth` cookie, `200 {success: true}` on match; `401` otherwise. Rate limiting is not implemented — this is a single-user private tool, see `docs/deployment.md` notes on exposure.

## POST /api/logout

Clears `editor-auth`. Frontend redirects to `/login`.

## cURL examples

Login:

```bash
TOKEN=$(printf '%s:%s' "$ADMIN" "$PASS" | base64)
curl -H "Cookie: editor-auth=$TOKEN" http://localhost:4321/
```

Keywords:

```bash
curl -X POST http://localhost:4321/api/generate \
  -H "Cookie: editor-auth=$TOKEN" -H "Content-Type: application/json" \
  -d '{"transcript":"Heute geht es um PHP und Vitest.","type":"keywords"}'
```

Stream all platforms:

```bash
curl -N -X POST http://localhost:4321/api/generate-all \
  -H "Cookie: editor-auth=$TOKEN" -H "Content-Type: application/json" \
  -d '{"transcript":"Heute geht es um PHP und Vitest.","videoDuration":"7:16"}'
```

From a video file:

```bash
curl -N -X POST http://localhost:4321/api/generate-from-video \
  -H "Cookie: editor-auth=$TOKEN" \
  -F "video=@/path/clip.mp4;type=video/mp4" -F "videoDuration=1:00"
```
