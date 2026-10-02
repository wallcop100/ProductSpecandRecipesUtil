import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ root: __dirname, plugins: [react()], define: { __APP_VERSION__: '"x"' }, server: { port: 5199, strictPort: true, fs: { allow: ['..'] } } })
