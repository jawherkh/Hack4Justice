import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'

const config = defineConfig({
  // Single .env at the repo root; only VITE_* keys are exposed to the client.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
})

export default config
