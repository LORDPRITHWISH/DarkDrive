import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Port is overridable via `PORT` env var for production (e.g. `PORT=4200 pnpm preview`).
const port = Number(process.env.PORT) || 4200

// Hosts Vite will accept behind a reverse proxy. Defaults to the production
// domain; override with comma-separated `ALLOWED_HOSTS` or set `ALLOWED_HOSTS=*`
// to let Vite serve any Host header.
const allowedHosts: string[] | true = (() => {
  const raw = process.env.ALLOWED_HOSTS
  if (raw === "*") return true
  if (raw) return raw.split(",").map((s) => s.trim()).filter(Boolean)
  return ["darkdrive.zenux.live", "localhost", "127.0.0.1"]
})()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port,
    host: true,
    allowedHosts,
    proxy: {
      "/api": { target: "http://localhost:4400", changeOrigin: true },
      "/socket.io": {
        target: "http://localhost:4400",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: true,
    allowedHosts,
    // In production the backend is on a different subdomain, so the frontend
    // talks to it directly via VITE_API_URL (no proxy needed here).
  },
})
