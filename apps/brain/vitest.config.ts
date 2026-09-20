import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    fileParallelism: false,
    globalSetup: ['./src/lib/db/vitest-global-setup.ts'],
    setupFiles: ['./src/lib/db/vitest-setup.ts'],
    env: {
      NODE_ENV: 'test',
      VITEST: 'true',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
