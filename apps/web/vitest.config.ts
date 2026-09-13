import { fileURLToPath } from 'node:url'

import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts: the TanStack Start plugin is not needed for unit tests.
export default defineConfig({
  plugins: [viteReact()],
  resolve: {
    alias: { '#': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
