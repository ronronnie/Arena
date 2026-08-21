import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Resolves the "@/*" alias straight from tsconfig.json — one source of truth.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    /*
     * Playwright owns tests/e2e. Vitest must not try to run those.
     *
     * tests/integration hits a real Postgres and skips itself when DATABASE_URL is
     * absent, so `npm run check` still passes on a fresh clone with no credentials.
     */
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.{ts,tsx}',
      'lib/**/*.test.{ts,tsx}',
    ],
    exclude: ['node_modules/**', '.next/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts'],
    },
  },
});
