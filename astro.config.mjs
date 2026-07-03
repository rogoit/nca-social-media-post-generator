import { defineConfig } from "astro/config";
import { loadEnv } from "vite";
import tailwind from "@astrojs/tailwind";
import node from "@astrojs/node";

const {
  EDITOR_ADMIN,
  EDITOR_PASSWORD,
  GOOGLE_GEMINI_API_KEY,
  GOOGLE_GEMINI_MODELS,
  MISTRAL_API_KEY,
  MISTRAL_MODELS,
  N8N_WEBHOOK_URL,
} = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
Object.assign(process.env, {
  EDITOR_ADMIN,
  EDITOR_PASSWORD,
  GOOGLE_GEMINI_API_KEY,
  GOOGLE_GEMINI_MODELS,
  MISTRAL_API_KEY,
  MISTRAL_MODELS,
  N8N_WEBHOOK_URL,
});

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind()],
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
});
