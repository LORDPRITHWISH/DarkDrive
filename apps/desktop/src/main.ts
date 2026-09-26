// DarkDrive desktop: a window and tray icon around the apps/sync daemon.
//
// The daemon does all the syncing. This only edits the config file it reads,
// starts and stops it, and shows what it prints. It runs in a utility process
// rather than in here so its process.exit()/top-level-await design stays as
// is, and a crash on either side can't take the other down.
//
// esbuild bundles this file to CommonJS (dist/main.cjs) and the daemon to
// dist/sync.mjs, so the packaged app ships no node_modules at all. Hence
// __dirname below despite the package being "type": "module".
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, shell, Tray, utilityProcess } from "electron"
import type { UtilityProcess } from "electron"
import { autoUpdater } from "electron-updater"
import crypto from "node:crypto"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import readline from "node:readline"

const here = __dirname
const DAEMON = path.join(here, "sync.mjs")
// Same resolution as the daemon, so the two share one config and state file.
const CONFIG_DIR = process.env.DD_HOME ?? path.join(os.homedir(), ".darkdrive")
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json")
const STATE_FILE = path.join(CONFIG_DIR, "state.json")
const DEFAULT_API = "https://api.darkdrive.zenux.live"
const LOG_LINES = 300
const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000
const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000

export type Config = { apiUrl: string; token: string; dir: string; device: string }

function readConfig(): Config {
  let saved: Partial<Config> = {}
  try {
    saved = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"))
  } catch {}
  return {
    apiUrl: saved.apiUrl ?? DEFAULT_API,
    token: saved.token ?? "",
    dir: saved.dir ?? path.join(os.homedir(), "DarkDrive"),
    device: saved.device ?? os.hostname(),
  }
}

function httpUrl(s: string): string {
  const u = new URL(s)
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Server must be an http(s) URL")
  return u.toString().replace(/\/+$/, "")
}

function writeConfig(input: Config) {
  const next: Config = {
    apiUrl: httpUrl(String(input.apiUrl).trim()),
    token: String(input.token).trim(),
    dir: String(input.dir).trim(),
    device: String(input.device).trim() || os.hostname(),
  }
  if (!path.isAbsolute(next.dir)) throw new Error("Folder must be an absolute path")
  const prev = readConfig()
  // state.json is keyed by paths relative to the folder and ids on one server.
  // Point it at a different folder or account and push() reads every tracked
  // file as "deleted locally" and trashes it remotely. Dropping the state makes
  // the next run a fresh reconcile instead, which only ever adds or moves aside.
  if (next.dir !== prev.dir || next.apiUrl !== prev.apiUrl || next.token !== prev.token)
    fs.rmSync(STATE_FILE, { force: true })
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), { mode: 0o600 })
}

// --------------------------------------------------------------- sign-in

const donePage = (msg: string) =>
  `<!doctype html><meta charset="utf-8"><title>DarkDrive</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#e5e5e5;font:16px system-ui,sans-serif">${msg}</body>`

/**
 * Browser sign-in (RFC 8252): listen on a loopback port, send the browser to
 * the server's pairing page, and wait for it to come back with a one-time code
 * that we trade for a device token. Google sign-in happens in the browser the
 * user already trusts, so the app never sees a password.
 */
function signIn(apiUrl: string, device: string): Promise<string> {
  const base = httpUrl(apiUrl)
  // Ties the callback to this attempt, so a stray or forged request to the
  // port (another tab, another app) can't feed us someone else's code.
  const state = crypto.randomBytes(24).toString("base64url")
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1")
      if (url.pathname !== "/callback" || url.searchParams.get("state") !== state)
        return void res.writeHead(404).end()
      try {
        const r = await fetch(`${base}/api/devices/claim`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: url.searchParams.get("code") }),
        })
        if (!r.ok) throw new Error(`Sign-in failed (${r.status}). Try again.`)
        const { token } = (await r.json()) as { token: string }
        res.writeHead(200, { "content-type": "text/html" }).end(donePage("Signed in. You can close this tab and go back to DarkDrive."))
        resolve(token)
      } catch (e) {
        res.writeHead(500, { "content-type": "text/html" }).end(donePage("Sign-in failed. Go back to DarkDrive and try again."))
        reject(e)
      }
      finish()
    })
    const timer = setTimeout(() => (finish(), reject(new Error("Sign-in timed out. Try again."))), SIGN_IN_TIMEOUT_MS)
    // close() also drops the browser's keep-alive socket once the reply is out.
    const finish = () => (clearTimeout(timer), server.close())
    server.on("error", reject)
    // 127.0.0.1, never 0.0.0.0: the port must not be reachable from the network.
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number }
      const q = new URLSearchParams({ port: String(port), state, name: device || os.hostname() })
      shell.openExternal(`${base}/api/devices/pair?${q}`)
    })
  })
}

// ---------------------------------------------------------------- daemon

let daemon: UtilityProcess | null = null
const log: string[] = []

function emit(channel: string, value: unknown) {
  win?.webContents.send(channel, value)
}

function addLine(line: string) {
  log.push(line)
  if (log.length > LOG_LINES) log.shift()
  emit("log", line)
}

function setRunning() {
  emit("running", !!daemon)
  refreshTray()
}

function start() {
  if (daemon) return
  const child = utilityProcess.fork(DAEMON, [], { stdio: "pipe", serviceName: "DarkDrive sync" })
  daemon = child
  for (const stream of [child.stdout, child.stderr])
    if (stream) readline.createInterface({ input: stream }).on("line", addLine)
  child.on("exit", (code) => {
    daemon = null
    addLine(`[desktop] sync stopped${code ? ` (exit ${code})` : ""}`)
    setRunning()
  })
  setRunning()
}

function stop(): Promise<void> {
  const child = daemon
  if (!child) return Promise.resolve()
  // SIGTERM on POSIX, which the daemon catches to save its state first.
  return new Promise((resolve) => {
    child.once("exit", () => resolve())
    child.kill()
  })
}

// -------------------------------------------------------------------- ui

const icon = nativeImage.createFromPath(path.join(here, "../ui/icon.png"))
let win: BrowserWindow | null = null
let tray: Tray | null = null

function show() {
  if (win) return void (win.show(), win.focus())
  win = new BrowserWindow({
    width: 560,
    height: 720,
    title: "DarkDrive",
    icon,
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(here, "preload.cjs") },
  })
  win.loadFile(path.join(here, "../ui/index.html"))
  win.on("closed", () => (win = null))
}

function refreshTray() {
  if (!tray) return
  tray.setToolTip(`DarkDrive ${app.getVersion()} — ${daemon ? "syncing" : "paused"}`)
  // Linux tray icons often never deliver clicks, so everything lives in the menu.
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `DarkDrive ${app.getVersion()} — ${daemon ? "Syncing" : "Paused"}`, enabled: false },
      ...(updateReady
        ? [{ label: `Restart to update to ${updateReady}`, click: () => autoUpdater.quitAndInstall() }]
        : []),
      { label: daemon ? "Pause sync" : "Resume sync", click: () => (daemon ? stop() : start()) },
      { label: "Open folder", click: () => shell.openPath(readConfig().dir) },
      { label: "Show window", click: show },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ])
  )
}

// ---------------------------------------------------- updates & autostart

// Installers and latest*.yml come from GitHub Releases (see "publish" in
// package.json). Checks only run in a packaged build: a dev run has no
// installer to replace.
let updateReady: string | null = null

autoUpdater.on("error", (e) => addLine(`[desktop] update check failed: ${e.message}`))
autoUpdater.on("update-downloaded", ({ version }) => {
  // The per-user NSIS installer needs no admin rights, so Windows can update
  // silently and relaunch itself. A .deb goes through pkexec, which means a
  // password prompt, so on Linux we offer it instead of springing one on
  // the user out of nowhere.
  if (process.platform === "win32") return autoUpdater.quitAndInstall(true, true)
  updateReady = version
  addLine(`[desktop] version ${version} downloaded — restart to install`)
  emit("update", version)
  refreshTray()
  new Notification({ title: "DarkDrive update ready", body: `Restart DarkDrive to update to ${version}.` }).show()
})

function checkForUpdates() {
  // Failures arrive through the "error" event above.
  autoUpdater.checkForUpdates().catch(() => {})
}

/** Launch at login, straight to the tray. */
function registerAutostart() {
  if (process.platform !== "linux") return app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] })
  // No login-item API on Linux; the XDG autostart spec is what every desktop reads.
  const dir = path.join(app.getPath("appData"), "autostart")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, "darkdrive.desktop"),
    `[Desktop Entry]\nType=Application\nName=DarkDrive\nExec="${process.execPath}" --hidden\nIcon=darkdrive\nX-GNOME-Autostart-enabled=true\n`
  )
}

ipcMain.handle("config:get", () => readConfig())
ipcMain.handle("config:save", async (_e, cfg: Config) => {
  writeConfig(cfg)
  await stop()
  start()
})
ipcMain.handle("sign-in", async (_e, cfg: Config) => {
  const token = await signIn(cfg.apiUrl, cfg.device)
  writeConfig({ ...cfg, token })
  await stop()
  start()
  show() // the browser has focus now; bring the user back
})
ipcMain.handle("state:get", () => ({ running: !!daemon, log, version: app.getVersion(), updateReady }))
ipcMain.handle("update:install", () => autoUpdater.quitAndInstall())
ipcMain.handle("sync:start", () => start())
ipcMain.handle("sync:stop", () => stop())
ipcMain.handle("dir:pick", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle("open:folder", () => shell.openPath(readConfig().dir))

// Two copies would run two daemons over one state file.
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on("second-instance", show)
  // Closing the window leaves sync running in the tray; Quit is in its menu.
  app.on("window-all-closed", () => {})
  app.on("before-quit", () => void stop())
  app.whenReady().then(() => {
    tray = new Tray(icon.resize({ width: 22, height: 22 }))
    tray.on("click", show)
    refreshTray()
    if (readConfig().token) start()
    // Dev runs would register the bare electron binary, and have nothing to update.
    if (app.isPackaged) {
      registerAutostart()
      checkForUpdates()
      setInterval(checkForUpdates, UPDATE_CHECK_MS)
    }
    // --hidden is for launching at login: straight to the tray.
    if (!readConfig().token || !process.argv.includes("--hidden")) show()
  })
}
