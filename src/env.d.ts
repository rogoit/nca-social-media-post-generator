/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly MISTRAL_API_KEY?: string;
  readonly MISTRAL_MODELS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
