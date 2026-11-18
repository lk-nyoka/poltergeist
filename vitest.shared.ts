import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    setupFiles: [fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))],
    // Cap concurrent worker processes. Spawning one fork per test file at once was
    // intermittently failing to start workers under load (Windows, the ~25-file shop suite).
    maxWorkers: 4,
  },
});
