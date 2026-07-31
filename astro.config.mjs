import { defineConfig } from "astro/config";
import { loadEnv } from "vite";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";
import node from "@astrojs/node";

const env = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
const RUNTIME_ENV_KEYS = [
  "EDITOR_ADMIN",
  "EDITOR_PASSWORD",
  "GOOGLE_GEMINI_API_KEY",
  "GOOGLE_GEMINI_MODELS",
  "MISTRAL_API_KEY",
  "MISTRAL_MODELS",
];

// Copy defined values into process.env so `import.meta.env` in SSR code sees
// them. NOTE: assigning undefined to process.env produces the literal string
// "undefined", which poisons boolean env checks downstream — so we filter.
for (const key of RUNTIME_ENV_KEYS) {
  if (env[key] !== undefined) {
    process.env[key] = env[key];
  }
}

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind(), react()],
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
});
