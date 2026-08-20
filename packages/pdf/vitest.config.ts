import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    reporters: ['default', 'blob'],
    outputFile: {
      blob: 'coverage/blob/report.json',
    },
    setupFiles: ['test/**/**'],
    passWithNoTests: true,
  },
});
