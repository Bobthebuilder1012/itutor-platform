import path from 'path';
import { defineConfig } from 'vitest/config';

// Offline unit tests. Nothing here may touch a database, Stripe or the network.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
