import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Components are written for Next's automatic JSX runtime (no `import React`), so the tests compile them the same way.
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.{ts,tsx}'],
    globals: false,
  },
});
