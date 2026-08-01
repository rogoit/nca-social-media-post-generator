import { defineConfig } from "astro/config";
import { loadEnv } from "vite";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";
import node from "@astrojs/node";

const env = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
const RUNTIME_ENV_KEYS = ["EDITOR_ADMIN", "EDITOR_PASSWORD", "MISTRAL_API_KEY", "MISTRAL_MODELS"];

// Copy defined values into process.env so `import.meta.env` in SSR code sees
// them. NOTE: assigning undefined to process.env produces the literal string
// "undefined", which poisons boolean env checks downstream — so we filter.
for (const key of RUNTIME_ENV_KEYS) {
  if (env[key] !== undefined) {
    process.env[key] = env[key];
  }
}

// Fail fast: without these, every request eventually crashes mid-pipeline.
// Validate at startup so misconfigurations are visible immediately.
// Skipped during `astro build`: env vars are runtime-only (Docker, CI).
const isBuild = process.argv.some((arg) => arg === "build");
const REQUIRED_ENV_KEYS = ["EDITOR_ADMIN", "EDITOR_PASSWORD", "MISTRAL_API_KEY"];
const missing = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]);
if (!isBuild && missing.length > 0) {
  console.error(
    `\nMissing required environment variables: ${missing.join(", ")}.\n` +
      `Set them in .env / .env.local (see README.md) and restart.\n`
  );
  process.exit(1);
}

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind(), react()],
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
});
