# Deployment

## Runtime model

Astro SSR behind the Node adapter (`standalone`), single Docker container, port 4321. A SQLite file (`/app/data/nca.db`, mounted from `./data` on the host) persists generation runs so a refresh or SSE drop can resume. The video bytes themselves are never persisted — only the filename and generated text artifacts.

## Docker

`Dockerfile.conversis` — multi-stage:

1. `deps`: `npm ci`
2. `builder`: `npm run build`
3. `runtime`: copies `node_modules` + `dist`, runs `node dist/server/entry.mjs` as the non-root `node` user

Build and run locally:

```bash
docker build -f Dockerfile.conversis -t nca-smgen .
docker run --rm -p 4321:4321 \
  -v "$PWD/data:/app/data" \
  -e EDITOR_ADMIN=... -e EDITOR_PASSWORD=... \
  -e MISTRAL_API_KEY=... \
  nca-smgen
```

The `./data` volume holds the SQLite file (`nca.db`) that persists runs for resume. Without it, resume still works within a container's lifetime but is lost on redeploy.

## GitLab CI

`.gitlab-ci.yml` stages:

| Stage    | Runs on   | Content                                               |
| -------- | --------- | ----------------------------------------------------- |
| `test`   | main + MR | `npm ci` → `type-check` → `format:check` → `test:run` |
| `build`  | main + MR | docker build & push to the project registry           |
| `deploy` | main only | pulls the image and restarts the service on the host  |

Pipelines fail fast on any quality-gate step — a red MR never produces an image.

## Environment

At runtime, provide all four required vars (see `docs/development.md`). On boot the app validates them and **exits with a clear error if any is missing** — check container logs first when the service dies immediately after deploy. Validation is skipped during `astro build` itself (the image is built before env is known).

## Startup validation gotchas

- Never assign `undefined` into `process.env` — JS stringifies it to the literal `"undefined"`, which poisons truthy checks downstream (this actually happened; see commit history). The config only copies _defined_ values.
- If you rename/extend required vars: update `RUNTIME_ENV_KEYS` **and** `REQUIRED_ENV_KEYS` in `astro.config.mjs`, and the table in `docs/development.md`.

## Operational notes

- **No rate limiting, no WAF, single-cookie auth**: deploy behind a private network/VPN or an authenticating reverse proxy. Exposing it bare on the internet means anyone who guesses the login sees the UI and spends your Ollama/Mistral quota.
- **No health endpoint yet**: for platform healthchecks use `GET /login` (200 = process alive). A dedicated `/api/health` would be the minimal addition if your platform requires one.
- **Memory**: video uploads have no size cap; the Buffer lives in the request scope and is released after the ffmpeg extraction. The temp WAV is cleaned up after Voxtral returns. Peak memory ≈ 2 × video size per active request, so very large videos are RAM-bound — single-user usage makes this acceptable; don't horizontally scale without revisiting. Neither Traefik nor the Astro Node adapter impose a default request-body limit, so large uploads go through without extra config.
- **ffmpeg**: the Docker image installs ffmpeg via `apk add ffmpeg` in the runtime stage. If running outside Docker, ensure ffmpeg is on PATH.
- **Logs**: plain `console.*` to stdout/stderr, captured by whatever runs the container.
- **TLS**: terminate at the proxy; the app listens plain HTTP on 4321.
