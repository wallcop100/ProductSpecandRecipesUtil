import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // electron/main.js loads http://localhost:5173 in dev. Without strictPort, Vite
  // silently moves to 5174 when 5173 is taken (another project's dev server), and
  // Electron then loads THAT project. Fail loudly instead of showing a stranger's app.
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/frontend/setup.js'],
    globals: true,
  },
})
