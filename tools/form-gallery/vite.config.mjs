// Builds the Form pane gallery (main.jsx) with the app's own config: every pane state at ?s=<state>.
// npx vite build --config tools/form-gallery/vite.config.mjs, then serve dist/form-gallery.
import { fileURLToPath } from 'node:url'
import app from '../../vite.config.js'
const here = fileURLToPath(new URL('.', import.meta.url))
export default { ...app, root: here, build: { outDir: fileURLToPath(new URL('../../dist/form-gallery', import.meta.url)), emptyOutDir: true } }
