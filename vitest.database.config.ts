import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['database/**/*.test.{ts,tsx}', 'database/**/__tests__/**/*.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
  },
});
