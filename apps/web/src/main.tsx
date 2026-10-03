import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@workspace/ui/globals.css"
import { App } from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"

// The window's title bar is ours to draw (an installed app, or the desktop
// app): globals.css makes each page's <header> the title bar under .wco.
const overlay = (navigator as { windowControlsOverlay?: EventTarget & { visible: boolean } }).windowControlsOverlay
const syncOverlay = () => document.documentElement.classList.toggle("wco", !!overlay?.visible)
overlay?.addEventListener("geometrychange", syncOverlay)
syncOverlay()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)
