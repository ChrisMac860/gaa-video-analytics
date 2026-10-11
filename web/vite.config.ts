import { defineConfig } from 'vitest/config';

// Relative base so the build works at https://<user>.github.io/<repo>/ and from any sub-path.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
