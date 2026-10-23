import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import pkg from './package.json'

// The commit this build is of, stamped into index.html so a served copy can be checked against the
// repo. CI sets GITHUB_SHA; a build without .git (a Docker context) passes BUILD_COMMIT.
function buildCommit() {
  if (process.env.BUILD_COMMIT) return process.env.BUILD_COMMIT
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA
  try { return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { return 'unknown' }
}

// The tree (the files) this build is of: a "Ship dev" merge makes a new commit but keeps dev's tree, so
// the build name (App.jsx) stays the same from dev to prod. A Docker context passes BUILD_TREE.
function buildTree() {
  if (process.env.BUILD_TREE) return process.env.BUILD_TREE
  try { return execSync('git rev-parse HEAD^{tree}', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { return 'unknown' }
}

const stampCommit = {
  name: 'stamp-commit',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'build-commit', content: buildCommit() }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'build-tree', content: buildTree() }, injectTo: 'head' }],
}

export default defineConfig({
  plugins: [react(), stampCommit],
  // Relative base — resolves correctly under the GitHub Pages project subpath
  // (/ProductSpecandRecipesUtil/) as well as at a domain root.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // 'dev' for the build that serves the dev branch (APP_CHANNEL=dev); every other build is 'prod'.
    __APP_CHANNEL__: JSON.stringify(process.env.APP_CHANNEL || 'prod'),
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
