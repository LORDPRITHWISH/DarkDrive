// The window: the web app (apps/web), built into this app from the same
// monorepo and served from darkdrive://app, so the desktop app has every
// feature the web has, version for version. What a browser can't do (folder
// sync, the tray, signing in with a device token) reaches it through
// drive-preload.cts, and the web app shows its desktop-only pages (/sync)
// when that's there.
//
// It signs in with this computer's device token, which is added to its
// requests to the API, so there's no second sign-in and no Google page inside
// the app. It all runs in its own session, "persist:drive", and the token is
// only ever added there, and only for the API's host.
import { app, BrowserWindow, nativeImage, net, Notification, protocol, session, shell, type WebContents } from "electron"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { readSettings, type Settings } from "./settings.js"

/** Where the web app is served. The API allows this origin (apps/api, lib/origins.ts). */
export const APP_URL = "darkdrive://app/"
// apps/web's `vite build`, copied in by this package's build script.
const WEB_DIR = path.join(__dirname, "web")

// Standard + secure gives the scheme a real origin, so the web app's router,
// localStorage, fetch and CORS all behave as they do on https. Has to happen
// before app ready, hence here at import.
protocol.registerSchemesAsPrivileged([
  { scheme: "darkdrive", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true } },
])

const icon = nativeImage.createFromPath(path.join(__dirname, "../ui/icon.png"))
const drive = () => session.fromPartition("persist:drive")
let win: BrowserWindow | null = null

// API routes all live under /api/. Compared as strings: Node's URL doesn't
// know darkdrive: is a standard scheme, and gives its URLs no origin.
function where(url: string): "api" | "app" | "outside" {
  if (url.startsWith(APP_URL)) return "app"
  try {
    const u = new URL(url)
    if (u.host === new URL(readSettings().apiUrl).host && u.pathname.startsWith("/api/")) return "api"
  } catch {}
  return "outside"
}

/** Whether an IPC message comes from the app's own pages, the only ones that may drive it. */
export const fromApp = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
  !!e.senderFrame?.url.startsWith(APP_URL)

// A page can ask for any scheme; only hand the ones meant for a browser on.
function openOutside(url: string) {
  if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
}

/** Keep an app page (or a window it opened) on the app; links out go to the browser. */
function guard(wc: WebContents) {
  wc.setWindowOpenHandler(({ url }) => {
    // Downloads open a window on the API (lib/download.ts in the web app).
    // It stays hidden: will-download below saves the file and closes it.
    if (where(url) === "api") return { action: "allow", overrideBrowserWindowOptions: { show: false } }
    if (where(url) === "app") return { action: "allow" }
    openOutside(url)
    return { action: "deny" }
  })
  wc.on("will-navigate", (e, url) => {
    const to = where(url)
    // Google's sign-in page never loads in here: the web app signs in
    // through the desktop bridge instead (DesktopSignIn in apps/web).
    if (to === "api" && new URL(url).pathname.startsWith("/api/auth/")) e.preventDefault()
    else if (to === "outside") {
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

/** Wire up the app's session. Once, after app ready. */
export function setup() {
  // Any path without a file is one of the web app's own routes (/drive/…,
  // /sync), so it gets index.html and the router takes it from there.
  drive().protocol.handle("darkdrive", (req) => {
    const file = path.join(WEB_DIR, decodeURIComponent(new URL(req.url).pathname))
    // The startsWith is the fence: an encoded "..%2f" survives URL parsing
    // and only turns into ".." here.
    const found = file.startsWith(WEB_DIR + path.sep) && fs.statSync(file, { throwIfNoEntry: false })?.isFile()
    return net.fetch(pathToFileURL(found ? file : path.join(WEB_DIR, "index.html")).toString())
  })
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

/** Sign the app's API requests with `s.token`, and reload it. Again whenever the account changes. */
export function authorize(s: Settings) {
  const api = new URL(s.apiUrl)
  const ws = api.protocol.replace("http", "ws") // Socket.IO's websocket upgrade
  drive().webRequest.onBeforeSendHeaders((d, cb) => {
    const u = new URL(d.url)
    const toApi = u.host === api.host && (u.protocol === api.protocol || u.protocol === ws)
    cb({ requestHeaders: toApi && s.token ? { ...d.requestHeaders, Authorization: `Bearer ${s.token}` } : d.requestHeaders })
  })
  // Reloaded rather than told: the page reads the API's address once, at start.
  win?.loadURL(APP_URL)
}

/** Tell the open window something changed (the bridge's onChange). */
export function send(channel: string) {
  win?.webContents.send(channel)
}

/** Show the app, at `route` (a web app path like "/sync") if given. */
export function open(route?: string) {
  if (win) {
    // Routed the way the back button does it, not reloaded, so an upload
    // in progress keeps going.
    if (route)
      win.webContents
        .executeJavaScript(`history.pushState(null, "", ${JSON.stringify(route)}); dispatchEvent(new PopStateEvent("popstate"))`)
        .catch(() => {})
    return void (win.show(), win.focus())
  }
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
  w.on("closed", () => (win = null))
  w.loadURL(new URL(route ?? "/", APP_URL).toString())
}
