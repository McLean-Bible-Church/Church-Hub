import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '.next/', '**/*.config.{ts,js}', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@church/database': path.resolve(__dirname, './packages/core/database/src'),
      '@church/ministry-platform': path.resolve(__dirname, './packages/core/ministry-platform/src'),
      '@church/nextjs-ui': path.resolve(__dirname, './packages/nextjs/ui/src'),
      '@church/nextjs-auth': path.resolve(__dirname, './packages/nextjs/auth/src'),
      // apps/platform path alias (`@/lib/...`, `@/services/...`)
      '@': path.resolve(__dirname, './apps/platform/src'),
    },
  },
});
