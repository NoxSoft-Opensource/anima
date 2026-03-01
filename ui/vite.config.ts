import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 18790,
    proxy: {
      '/api': 'http://localhost:18789',
      '/ws': {
        target: 'ws://localhost:18789',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
