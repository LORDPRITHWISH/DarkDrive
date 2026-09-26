// The drive window: the web app itself (apps/web), loaded from where it's
// hosted, so the desktop app has every DarkDrive feature the web has, the day
// the web gets it. Only what a browser can't do (folder sync, the tray) is
// built into the desktop app.
//
// It signs in with this computer's device token, which is added to its
// requests to the API, so there's no second sign-in and no Google page inside
// the app. It all runs in its own session, "persist:drive", and the token is
// only ever added there, and only for the API's host.
import { app, BrowserWindow, ipcMain, nativeImage, Notification, session, shell, type WebContents } from "electron"
import fs from "node:fs"
import path from "node:path"
import { readSettings, type Settings } from "./settings.js"

const icon = nativeImage.createFromPath(path.join(__dirname, "../ui/icon.png"))
const drive = () => session.fromPartition("persist:drive")
let win: BrowserWindow | null = null
let openSettings = () => {}

/** A bare page in the app's colours, for the few pages the app serves itself. */
export const plainPage = (html: string) =>
  `<!doctype html><meta charset="utf-8"><title>DarkDrive</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#e5e5e5;font:16px system-ui,sans-serif"><div style="text-align:center">${html}</div></body>`

// API routes all live under /api/, which also tells them apart from the web
// app when both are served from one host.
function where(url: string): "api" | "web" | "outside" {
  const { apiUrl, webUrl } = readSettings()
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return "outside"
  }
  if (u.host === new URL(apiUrl).host && u.pathname.startsWith("/api/")) return "api"
  if (u.origin === new URL(webUrl).origin) return "web"
  return "outside"
}

// A page can ask for any scheme; only hand the ones meant for a browser on.
function openOutside(url: string) {
  if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
}

/** Keep a drive page (or a window it opened) on DarkDrive; links out go to the browser. */
function guard(wc: WebContents) {
  wc.setWindowOpenHandler(({ url }) => {
    // Downloads open a window on the API (lib/download.ts in the web app).
    // It stays hidden: will-download below saves the file and closes it.
    if (where(url) === "api") return { action: "allow", overrideBrowserWindowOptions: { show: false } }
    if (where(url) === "web") return { action: "allow" }
    openOutside(url)
    return { action: "deny" }
  })
  wc.on("will-navigate", (e, url) => {
    const to = where(url)
    // The web app's "Sign in with Google", shown when this computer's token
    // stops working. Signing in is the settings window's job.
    if (to === "api" && new URL(url).pathname.startsWith("/api/auth/")) {
      e.preventDefault()
      openSettings()
    } else if (to === "outside") {
      e.preventDefault()
      openOutside(url)
    }
  })
  // A hidden download window that got a page instead (an error) shows it.
  wc.once("did-finish-load", () => {
    const w = BrowserWindow.fromWebContents(wc)
    if (w && !w.isVisible()) w.show()
  })
}

function freePath(dir: string, name: string) {
  const { name: base, ext } = path.parse(name)
  let p = path.join(dir, name)
  for (let i = 1; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`)
  return p
}

/** Wire up the drive session. Once, after app ready. */
export function setup(settingsWindow: () => void) {
  openSettings = settingsWindow
  ipcMain.on("sync-settings:open", () => openSettings())
  app.on("web-contents-created", (_e, wc) => {
    if (wc.session === drive()) guard(wc)
  })
  drive().on("will-download", (_e, item, wc) => {
    // Straight to Downloads, like a browser, rather than a save dialog each time.
    item.setSavePath(freePath(app.getPath("downloads"), path.basename(item.getFilename())))
    item.once("done", (_e, state) => {
      const w = BrowserWindow.fromWebContents(wc)
      if (w && !w.isVisible()) w.close()
      if (state !== "completed") return
      const n = new Notification({ title: "Downloaded", body: path.basename(item.getSavePath()) })
      n.on("click", () => shell.showItemInFolder(item.getSavePath()))
      n.show()
    })
  })
}

/** Sign the drive's API requests with `s.token`. Again whenever the account changes. */
export function authorize(s: Settings) {
  const api = new URL(s.apiUrl)
  const ws = api.protocol.replace("http", "ws") // Socket.IO's websocket upgrade
  drive().webRequest.onBeforeSendHeaders((d, cb) => {
    const u = new URL(d.url)
    const toApi = u.host === api.host && (u.protocol === api.protocol || u.protocol === ws)
    cb({ requestHeaders: toApi && s.token ? { ...d.requestHeaders, Authorization: `Bearer ${s.token}` } : d.requestHeaders })
  })
  win?.loadURL(s.webUrl)
}

export function open() {
  const s = readSettings()
  if (!s.token) return openSettings() // nothing to show until this computer is signed in
  if (win) return void (win.show(), win.focus())
  const w = new BrowserWindow({
    width: 1280,
    height: 820,
    title: "DarkDrive",
    icon,
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    webPreferences: { session: drive(), preload: path.join(__dirname, "drive-preload.cjs") },
  })
  win = w
  w.webContents.on("did-fail-load", (_e, code, desc, _url, mainFrame) => {
    // -3 is a load given up on purpose (a download, a blocked link), not an outage.
    if (mainFrame && code !== -3)
      w.loadURL(`data:text/html,${encodeURIComponent(plainPage(`Can't reach DarkDrive (${desc}).<p><a href="${s.webUrl}" style="color:#60a5fa">Try again</a>`))}`)
  })
  w.on("closed", () => (win = null))
  w.loadURL(s.webUrl)
}
