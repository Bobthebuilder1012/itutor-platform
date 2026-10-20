import path from 'path';
import { defineConfig } from 'vitest/config';

// Offline unit tests. Nothing here may touch a database, Stripe or the network.
export default defineConfig({
  // Next compiles JSX with the automatic runtime; tests that render a page need the same.
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
