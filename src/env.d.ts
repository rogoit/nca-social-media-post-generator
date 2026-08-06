/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly EDITOR_ADMIN?: string;
  readonly EDITOR_PASSWORD?: string;
  readonly MISTRAL_API_KEY?: string;
  readonly OLLAMA_API_KEY?: string;
  readonly OLLAMA_MODEL?: string;
  readonly OLLAMA_BASE_URL?: string;
  readonly OLLAMA_TIMEOUT_MS?: string;
  readonly DATABASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
