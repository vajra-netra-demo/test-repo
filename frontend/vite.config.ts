import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend routers all live under these prefixes (see backend/app/routers/*.py
// and backend/app/main.py) — proxy them to FastAPI in dev so the app can call
// relative paths ("/tools", "/discovery/status", ...) exactly like production,
// where the built frontend is served same-origin by FastAPI itself.
const API_PREFIXES = ['/discovery', '/tools', '/classify', '/regulation', '/report', '/tenants']

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      API_PREFIXES.map((prefix) => [
        prefix,
        { target: 'http://localhost:8000', changeOrigin: true },
      ]),
    ),
  },
})
