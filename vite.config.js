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
    // sql.js is CJS (`module.exports = initSqlJs`). Pre-bundle it so esbuild gives it a
    // real ESM default export — excluding it makes dev serve raw CJS, where `module` is
    // undefined in the browser and `(await import('sql.js')).default` is not a function.
    // Its wasm is loaded separately (the `?url` import + our locateFile), so bundling the
    // JS loader touches nothing. `include` bundles it upfront despite the dynamic import,
    // avoiding a first-open re-optimize + reload.
    include: ['sql.js'],
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
