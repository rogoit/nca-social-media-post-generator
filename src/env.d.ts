/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly EDITOR_ADMIN?: string;
  readonly EDITOR_PASSWORD?: string;
  readonly MISTRAL_API_KEY?: string;
  readonly MISTRAL_MODELS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
