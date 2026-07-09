import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  plugins: [react()],
  // Relative base — resolves correctly under the GitHub Pages project subpath
  // (/ProductSpecandRecipesUtil/) as well as at a domain root.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    // Fail loudly if 5173 is taken rather than silently moving to 5174.
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    // sql.js ships its own wasm loader; leave it alone.
    exclude: ['sql.js'],
  },
  build: {
    outDir: 'dist',
    // SheetJS and SQLite-WASM are both large and reached only via dynamic
    // import(), so Rollup splits them out and they stay off the first page load.
    // Do NOT list them in manualChunks — that would pull them into the initial
    // graph and have Vite modulepreload them.
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/frontend/setup.js'],
    globals: true,
  },
})
