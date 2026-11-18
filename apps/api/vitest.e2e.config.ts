import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Pruebas de punta a punta: necesitan una base PostgreSQL real (DATABASE_URL) con migraciones aplicadas.
export default defineConfig({
  test: { include: ['test/**/*.e2e.ts'], environment: 'node', testTimeout: 30000, hookTimeout: 60000, fileParallelism: false },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
