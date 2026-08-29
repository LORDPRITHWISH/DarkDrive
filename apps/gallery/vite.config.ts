import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Sits one port above the drive UI so both can run side by side in dev.
const port = Number(process.env.PORT) || 4300

const allowedHosts: string[] | true = (() => {
  const raw = process.env.ALLOWED_HOSTS
  if (raw === "*") return true
  if (raw) return raw.split(",").map((s) => s.trim()).filter(Boolean)
  return ["gallery.zenux.live", "localhost", "127.0.0.1"]
})()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port,
    host: true,
    allowedHosts,
    // Same-origin in dev so the session cookie (SameSite=lax) is sent on
    // every request, including <img> thumbnail loads.
    proxy: { "/api": { target: "http://localhost:4400", changeOrigin: true } },
  },
  preview: { port, host: true, allowedHosts },
})
