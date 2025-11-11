import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    env: {
      // Mock API keys for unit/functional tests
      // Real tests will use actual env vars
      GOOGLE_GEMINI_API_KEY: 'mock-google-key',
      ANTHROPIC_API_KEY: 'mock-anthropic-key',
      GOOGLE_GEMINI_MODELS: 'gemini-2.5-pro,gemini-2.5-flash',
      ANTHROPIC_MODELS: 'claude-3-haiku-20240307,claude-3-sonnet-20240229',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
        'src/scripts/**',
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        }
      }
    },
    // Default: run unit + functional (exclude real tests)
    include: ['test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', 'test/real/**'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});