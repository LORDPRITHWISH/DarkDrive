// DarkDrive desktop: the web app, plus what a browser can't do.
//
// The window is apps/web, built into this app and signed in with this
// computer's device token (drive.ts). Syncing is the apps/sync daemon's job,
// one copy per synced folder (folders.ts). This is the shell around both: the
// tray, sign-in, updates, and the bridge the web app's desktop-only pages talk
// to (drive-preload.cts). It keeps the settings the daemons read
// (settings.ts), starts and stops them, and shows what they print. They run
// in utility processes rather than in here so the daemon's
// process.exit()/top-level-await design stays as is, and a crash on either
// side can't take the other down.
//
// esbuild bundles this file to CommonJS (dist/main.cjs) and the daemon to
// dist/sync.mjs, so the packaged app ships no node_modules at all. Hence
// __dirname below despite the package being "type": "module".
import { app, dialog, ipcMain, Menu, nativeImage, Notification, shell, Tray } from "electron"
import { autoUpdater } from "electron-updater"
import crypto from "node:crypto"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import * as drive from "./drive.js"
import * as folders from "./folders.js"
import { apiCall, httpUrl, readSettings, writeSettings, type Settings } from "./settings.js"

const here = __dirname
const LOG_LINES = 300
const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000
const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000

// --------------------------------------------------------------- sign-in

/** A bare page in the app's colours, for the browser tab sign-in ends in. */
const plainPage = (html: string) =>
  `<!doctype html><meta charset="utf-8"><title>DarkDrive</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#e5e5e5;font:16px system-ui,sans-serif"><div style="text-align:center">${html}</div></body>`

let cancelSignIn = () => {}

/**
 * Browser sign-in (RFC 8252): listen on a loopback port, send the browser to
 * the server's pairing page, and wait for it to come back with a one-time code
 * that we trade for a device token. Google sign-in happens in the browser the
 * user already trusts, so the app never sees a password.
 *
 * A second attempt (the user closed the tab and clicked again) ends the first,
 * which then resolves null.
 */
function signIn(apiUrl: string, device: string): Promise<{ token: string; id: string } | null> {
  cancelSignIn()
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
        const got = (await r.json()) as { token: string; id: string }
        res.writeHead(200, { "content-type": "text/html" }).end(plainPage("Signed in. You can close this tab and go back to DarkDrive."))
        resolve(got)
      } catch (e) {
        res.writeHead(500, { "content-type": "text/html" }).end(plainPage("Sign-in failed. Go back to DarkDrive and try again."))
        reject(e)
      }
      finish()
    })
    const timer = setTimeout(() => (finish(), reject(new Error("Sign-in timed out. Try again."))), SIGN_IN_TIMEOUT_MS)
    // close() also drops the browser's keep-alive socket once the reply is out.
    const finish = () => (clearTimeout(timer), server.close())
    cancelSignIn = () => (finish(), resolve(null))
    server.on("error", reject)
    // 127.0.0.1, never 0.0.0.0: the port must not be reachable from the network.
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number }
      const q = new URLSearchParams({ port: String(port), state, name: device || os.hostname() })
      shell.openExternal(`${base}/api/devices/pair?${q}`)
    })
  })
}

/**
 * Revoke the token `s` held, once saveAccount has moved the daemons off it.
 * Best effort: it's forgotten here either way, so an offline server only
 * keeps a dead row (Profile → Devices can still revoke it).
 */
async function revoke(s: Settings) {
  if (s.token && s.deviceId) await apiCall(s, "DELETE", `/api/devices/${s.deviceId}`).catch(() => {})
}

/**
 * Daemons read the token and device name when they start, so an account
 * change restarts them all, and the window reloads under the new one.
 * `fresh` is a new sign-in, which may be a different account: its folders are
 * then checked against that account.
 */
async function saveAccount(patch: Partial<Settings>, fresh = false) {
  await folders.pause()
  try {
    const s = { ...readSettings(), ...patch }
    // Offline right after signing in: keep the list, the daemons will say.
    if (fresh) s.folders = await folders.forAccount(s).catch(() => s.folders)
    writeSettings(s)
  } finally {
    folders.resume(readSettings())
    drive.authorize(readSettings())
  }
}

// ------------------------------------------------------------------- log

const log: string[] = []

// Batched: the first sync of a big folder prints a line per file.
let changeQueued = false
function changed() {
  if (changeQueued) return
  changeQueued = true
  setTimeout(() => ((changeQueued = false), drive.send("desktop:changed")), 200)
}

function addLine(line: string) {
  log.push(line)
  if (log.length > LOG_LINES) log.shift()
  changed()
}

folders.events.on("line", addLine)
folders.events.on("change", () => {
  changed()
  refreshTray()
})

// ------------------------------------------------------------------ tray

const icon = nativeImage.createFromPath(path.join(here, "../ui/icon.png"))
let tray: Tray | null = null

function refreshTray() {
  if (!tray) return
  const running = folders.isRunning()
  const synced = readSettings().folders
  tray.setToolTip(`DarkDrive ${app.getVersion()} — ${running ? "syncing" : "paused"}`)
  // Linux tray icons often never deliver clicks, so everything lives in the menu.
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `DarkDrive ${app.getVersion()} — ${running ? "Syncing" : "Paused"}`, enabled: false },
      ...(updateReady
        ? [{ label: `Restart to update to ${updateReady}`, click: () => autoUpdater.quitAndInstall() }]
        : []),
      ...(synced.length
        ? [
            {
              label: running ? "Pause sync" : "Resume sync",
              click: () => (running ? folders.pause() : folders.resume(readSettings())),
            },
            {
              label: "Open folder",
              submenu: synced.map((f) => ({ label: f.name, click: () => shell.openPath(f.dir) })),
            },
          ]
        : []),
      { label: "Open DarkDrive", click: () => drive.open() },
      { label: "Sync settings…", click: () => drive.open("/sync") },
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

// ---------------------------------------------------------------- bridge
// What drive-preload.cts calls, for the web app (apps/web lib/desktop.ts).

function bridge(channel: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(`desktop:${channel}`, (e, ...args) => {
    if (!drive.fromApp(e)) throw new Error("Not allowed.")
    return fn(...args)
  })
}

ipcMain.on("desktop:config", (e) => {
  const { apiUrl, webUrl } = readSettings()
  // Always answered: sendSync would hang the page otherwise.
  e.returnValue = drive.fromApp(e) ? { apiUrl, webUrl } : null
})

bridge("state", () => {
  const { apiUrl, webUrl, device, folders: list } = readSettings()
  return { apiUrl, webUrl, device, folders: list, syncing: folders.isRunning(), log, version: app.getVersion(), updateReady }
})

bridge("sign-in", async () => {
  const old = readSettings()
  const got = await signIn(old.apiUrl, old.device)
  if (!got) return
  await saveAccount({ token: got.token, deviceId: got.id }, true)
  drive.open() // the browser has focus now; bring the user back
  await revoke(old) // signed in again, maybe as someone else
})

bridge("sign-out", async () => {
  const old = readSettings()
  await saveAccount({ token: "", deviceId: "" })
  await revoke(old)
})

// Where this computer signs in. A token is only good on the server that made it.
bridge("save-server", async (a: { apiUrl: string; webUrl: string; device: string }) => {
  const old = readSettings()
  const moved = httpUrl(String(a.apiUrl)) !== httpUrl(old.apiUrl)
  await saveAccount({ apiUrl: a.apiUrl, webUrl: a.webUrl, device: a.device, ...(moved && { token: "", deviceId: "" }) })
  if (moved) await revoke(old)
})

bridge("syncing", (on: boolean) => (on ? folders.resume(readSettings()) : folders.pause()))
bridge("update:install", () => autoUpdater.quitAndInstall())

async function pickDir(title: string): Promise<string | null> {
  const r = await dialog.showOpenDialog({ title, buttonLabel: "Choose", properties: ["openDirectory", "createDirectory"] })
  return r.canceled ? null : r.filePaths[0]
}

bridge("folders:available", () => folders.available(readSettings()))
bridge("folders:add-local", async () => {
  const dir = await pickDir("Choose a folder to sync with DarkDrive")
  if (dir) await folders.addLocal(readSettings(), dir)
})
// Takes only the id from the page; the name, which becomes a path on disk,
// comes fresh from the server.
bridge("folders:add-remote", async (id: string) => {
  const remote = (await folders.available(readSettings())).find((r) => r.id === id)
  if (!remote) throw new Error("That folder isn't in DarkDrive's Synced Folders any more.")
  const parent = await pickDir(`Choose where to keep "${remote.name}"`)
  if (parent) folders.addRemote(readSettings(), remote, parent)
})
bridge("folders:remove", (id: string) => folders.remove(readSettings(), id))
bridge("folders:open", (id: string) => {
  const f = readSettings().folders.find((f) => f.id === id)
  if (f) shell.openPath(f.dir)
})

// ------------------------------------------------------------------ main

// Two copies would run two daemons over each state file.
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on("second-instance", () => drive.open())
  // Closing the window leaves sync running in the tray; Quit is in its menu.
  app.on("window-all-closed", () => {})
  app.on("before-quit", () => void folders.pause())
  app.whenReady().then(() => {
    tray = new Tray(icon.resize({ width: 22, height: 22 }))
    tray.on("click", () => drive.open())
    refreshTray()
    drive.setup()
    drive.authorize(readSettings())
    folders.resume(readSettings())
    // Dev runs would register the bare electron binary, and have nothing to update.
    if (app.isPackaged) {
      registerAutostart()
      checkForUpdates()
      setInterval(checkForUpdates, UPDATE_CHECK_MS)
    }
    // --hidden is for launching at login: straight to the tray, unless
    // there's no sign-in yet to sync with.
    if (!readSettings().token || !process.argv.includes("--hidden")) drive.open()
  })
}
