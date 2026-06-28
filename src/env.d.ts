/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly GOOGLE_GEMINI_API_KEY: string;
  readonly GOOGLE_GEMINI_MODELS?: string;
  readonly MISTRAL_API_KEY?: string;
  readonly MISTRAL_MODELS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
