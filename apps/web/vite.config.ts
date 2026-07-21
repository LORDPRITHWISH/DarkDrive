import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

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
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Custom SW (src/sw.ts) because the Android share target POSTs files,
      // which the generated worker has no way to handle.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,woff2}"] },
      manifest: {
        name: "DarkDrive",
        short_name: "DarkDrive",
        description: "DarkDrive - Secure Cloud Storage",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        // Windows/Linux: draw our own title bar instead of Chrome's. Falls
        // back to plain standalone anywhere it isn't supported.
        display_override: ["window-controls-overlay", "standalone"],
        start_url: "/",
        // Focus the running window instead of opening a second one.
        launch_handler: { client_mode: "navigate-existing" },
        // Android: puts DarkDrive in the system share sheet. Files arrive as a
        // POST, which src/sw.ts intercepts.
        share_target: {
          action: "/share-target",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "title",
            text: "text",
            url: "url",
            files: [{ name: "files", accept: ["*/*"] }],
          },
        },
        // Right-click the taskbar / launcher icon.
        shortcuts: [
          { name: "Recent", url: "/recent" },
          { name: "Starred", url: "/starred" },
          { name: "Spaces", url: "/spaces" },
          { name: "Search", url: "/search" },
        ],
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
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
