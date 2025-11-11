import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Load env file for all modes
  const env = loadEnv(mode || "test", process.cwd(), "");

  return {
    test: {
      // Default environment for unit/functional tests (DOM testing)
      environment: "jsdom",
      // Load API keys from .env file
      env: {
        GOOGLE_GEMINI_API_KEY: env.GOOGLE_GEMINI_API_KEY,
        ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
        GOOGLE_GEMINI_MODELS: env.GOOGLE_GEMINI_MODELS || "gemini-2.5-pro,gemini-2.5-flash",
        ANTHROPIC_MODELS: env.ANTHROPIC_MODELS || "claude-3-haiku-20240307,claude-3-sonnet-20240229",
      },
      // Use projects for different test configurations
      projects: [
        {
          test: {
            name: "unit-functional",
            include: ["test/unit/**", "test/functional/**"],
            environment: "jsdom",
          },
        },
        {
          test: {
            name: "real",
            include: ["test/real/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
            environment: "node",
          },
        },
      ],
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html"],
        exclude: [
          "node_modules/",
          "dist/",
          "test/",
          "**/*.d.ts",
          "**/*.config.*",
          "**/coverage/**",
          "src/scripts/**",
        ],
        thresholds: {
          global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70,
          },
        },
      },
      // Include all test files by default
      include: ["test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
      exclude: ["node_modules", "dist", ".idea", ".git", ".cache", "**/*.md"],
    },
    resolve: {
      alias: {
        "@": "/src",
      },
    },
  };
});
