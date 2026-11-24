import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Every file shares one emulator and clears it between tests.
    fileParallelism: false,
    include: ['database/**/*.test.{ts,tsx}', 'database/**/__tests__/**/*.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
  },
});
