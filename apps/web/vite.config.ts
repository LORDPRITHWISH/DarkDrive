import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Port is overridable via `PORT` env var for production (e.g. `PORT=4200 pnpm preview`).
const port = Number(process.env.PORT) || 4200

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
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
      "/socket.io": {
        target: "http://localhost:4000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: true,
    // In production the backend is on a different subdomain, so the frontend
    // talks to it directly via VITE_API_URL (no proxy needed here).
  },
})
