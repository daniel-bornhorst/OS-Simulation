import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build works from a subfolder, e.g. GitHub Pages' /OS-Simulation/.
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
