// DarkDrive desktop: the web app, plus what a browser can't do.
//
// The window is apps/web, built into this app and signed in with this
// computer's device token (drive.ts). Syncing is the apps/sync daemon's job,
// one copy per synced folder (folders.ts). This is the shell around both: the
// tray, sign-in, updates, notifications, darkdrive:// links, the file
// manager's right-click actions (filemanager.ts), and the bridge the web
// app's desktop-only pages talk to (drive-preload.cts). It keeps the settings
// the daemons read (settings.ts), starts and stops them to the pause and the
// sync hours (schedule.ts), finds them LAN peers (lan.ts), and shows what
// they print. They run
// in utility processes rather than in here so the daemon's
// process.exit()/top-level-await design stays as is, and a crash on either
// side can't take the other down.
//
// esbuild bundles this file to CommonJS (dist/main.cjs) and the daemon to
// dist/sync.mjs, so the packaged app ships no node_modules at all. Hence
// __dirname below despite the package being "type": "module".
import { app, dialog, ipcMain, Menu, nativeImage, Notification, shell, Tray } from "electron"
import { autoUpdater } from "electron-updater"
import { spawn } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import * as drive from "./drive.js"
import * as fileManager from "./filemanager.js"
import * as folders from "./folders.js"
import * as lan from "./lan.js"
import * as local from "./local.js"
import { inHours, isTime, tomorrow, wanted } from "./schedule.js"
import { apiCall, FOREVER, httpUrl, readSettings, writeSettings, type Hours, type Settings, type SyncedFolder } from "./settings.js"

const here = __dirname

// Windows files an app's notifications under this id, and shows them only if
// it's the one the installer gave the Start Menu shortcut: appId in package.json.
if (process.platform === "win32") app.setAppUserModelId("live.zenux.darkdrive")
const LOG_LINES = 300
const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000
const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const SCHEDULE_CHECK_MS = 30 * 1000
const NOTIFICATIONS_CHECK_MS = 60 * 1000
const TRAY_TICK_MS = 3000
const SPEED_WINDOW_MS = 5000
const RECENT = 8

// --------------------------------------------------------------- sign-in

/** A bare page in the app's colours, for the browser tab sign-in ends in. */
const plainPage = (html: string) =>
  `<!doctype html><meta charset="utf-8"><title>DarkDrive</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#070b0e;color:#e5e5e5;font:16px system-ui,sans-serif"><div style="text-align:center">${html}</div></body>`

let cancelSignIn = () => {}
// The pairing page a sign-in is waiting on, shown in the app too: the browser
// that opens may not be the one the user is signed in to DarkDrive with.
let signInUrl: string | null = null

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
    const finish = () => {
      clearTimeout(timer)
      server.close()
      signInUrl = null
      changed()
    }
    cancelSignIn = () => (finish(), resolve(null))
    server.on("error", reject)
    // 127.0.0.1, never 0.0.0.0: the port must not be reachable from the network.
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number }
      const q = new URLSearchParams({ port: String(port), state, name: device || os.hostname() })
      signInUrl = `${base}/api/devices/pair?${q}`
      changed()
      shell.openExternal(signInUrl).catch((e) => addLine(`[desktop] couldn't open a browser: ${e.message}`))
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

// A temporary login (apps/api routes/tempSessions.ts), for a computer that
// isn't yours: a cookie session, never a device token, so nothing syncs.
// Only ever in memory, so quitting the app ends it on this computer too.
let tempSession = ""

/**
 * Daemons read the token and device name when they start, so an account
 * change restarts them all, and the window reloads under the new one.
 * `fresh` is a new sign-in, which may be a different account: its folders are
 * then checked against that account. Any temporary login ends.
 */
async function saveAccount(patch: Partial<Settings>, fresh = false) {
  await folders.pause()
  try {
    const s = { ...readSettings(), ...patch }
    // Offline right after signing in: keep the list, the daemons will say.
    if (fresh) s.folders = await folders.forAccount(s).catch(() => s.folders)
    writeSettings(s)
  } finally {
    tempSession = ""
    notifiedTo = null
    applySchedule(true)
    drive.authorize(readSettings())
    void lanSync?.refresh()
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

/** Something the window, the tray or the file manager shows may have changed. */
function refresh() {
  changed()
  refreshTray()
  // A dev run would point the file manager at the bare electron binary.
  if (app.isPackaged) {
    const s = readSettings()
    fileManager.publish(s, s.pausedUntil > Date.now(), folders.statusOf)
  }
}

folders.events.on("line", addLine)
folders.events.on("change", refresh)

// --------------------------------------------------------- notifications

// Held until they close: a notification nothing refers to can be collected
// before it's clicked, and its click handler with it.
const notes = new Set<Notification>()

function note(title: string, body: string, onClick?: () => void) {
  const n = new Notification({ title, body })
  notes.add(n)
  n.on("close", () => notes.delete(n))
  if (onClick) n.on("click", onClick)
  n.show()
}

const inFolder = (f: SyncedFolder, rel: string) => path.join(f.dir, ...rel.split("/"))

folders.events.on("done", (f, n) =>
  note("Sync complete", `${f.name}: ${n} ${n === 1 ? "file" : "files"} synced.`, () => shell.openPath(f.dir))
)
folders.events.on("conflict", (f, keptAs) =>
  note(
    "Sync conflict",
    `${f.name}: a file changed here and somewhere else. Yours is kept as "${path.posix.basename(keptAs)}".`,
    () => shell.showItemInFolder(inFolder(f, keptAs))
  )
)
folders.events.on("failed", (f, error, status, body) => {
  if (body.includes("quota_exceeded"))
    note("DarkDrive storage is full", `${f.name} can't finish syncing until there's room.`, () => drive.open("/storage"))
  else
    note(
      "Sync failed",
      status ? `${f.name}: ${error}` : `${f.name}: can't reach DarkDrive. Sync carries on once it can.`,
      () => drive.open("/sync")
    )
})

// The server's own notifications (the web app's bell: an invitation to a
// shared space, storage running out), shown natively too, since the window
// that would toast them is usually closed.
//
// ponytail: asked for once a minute. Join the Socket.IO `user:` room from
// here if a minute's delay starts to matter.
type ServerNote = { title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }
// The newest one seen, so each is shown once. null until the first look,
// which only finds where "new" starts: what's already there isn't news.
let notifiedTo: string | null = null

async function checkNotifications() {
  const s = readSettings()
  if (!s.token) return
  const { notifications } = await apiCall<{ notifications: ServerNote[] }>(s, "GET", "/api/notifications?limit=10")
  const since = notifiedTo
  notifiedTo = notifications[0]?.createdAt ?? since ?? ""
  // The window, when it's being looked at, toasts them itself.
  if (since === null || drive.focused()) return
  for (const n of notifications.filter((n) => !n.readAt && n.createdAt > since).reverse())
    note(n.title, n.body ?? "", () => drive.open(n.link?.startsWith("/") ? n.link : "/home"))
}

// -------------------------------------------------------------- activity

// The last few files to go up or down, and how fast bytes are moving: the
// tray's "Recent activity" and its speed line.
const recent: { dir: "up" | "down"; abs: string }[] = []
let traffic: { at: number; up: number; down: number }[] = []

folders.events.on("file", (f, dir, rel, sha) => {
  const abs = inFolder(f, rel)
  recent.unshift({ dir, abs })
  recent.length = Math.min(recent.length, RECENT)
  lanSync?.add(sha, abs)
})
folders.events.on("bytes", (up, down) => traffic.push({ at: Date.now(), up, down }))

/** Bytes a second each way, over the last few seconds. */
function speed() {
  traffic = traffic.filter((t) => t.at > Date.now() - SPEED_WINDOW_MS)
  const per = (way: "up" | "down") => traffic.reduce((n, t) => n + t[way], 0) / (SPEED_WINDOW_MS / 1000)
  return { up: per("up"), down: per("down") }
}

const rate = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB/s` : `${Math.ceil(n / 1e3)} KB/s`)

// -------------------------------------------------------------- schedule

// Whether the daemons are meant to be running, as last applied.
let scheduled: boolean | null = null

/**
 * Start or stop the daemons to match the pause and the sync hours
 * (schedule.ts). On a timer, since both are about the time of day, and after
 * either changes. `force` when something stopped the daemons behind its back.
 */
function applySchedule(force = false) {
  const s = readSettings()
  const on = wanted(s)
  if (on === scheduled && !force) return
  scheduled = on
  if (on) folders.resume(s)
  else void folders.pause()
  refresh()
}

/** Pause sync until `until` (ms): 0 resumes it now, FOREVER waits to be resumed. */
function pauseUntil(until: number) {
  writeSettings({ ...readSettings(), pausedUntil: until })
  applySchedule()
  refresh()
}

/** How sync is doing, in a few words. */
function status(s: Settings): string {
  if (!s.token) return "Signed out"
  if (!s.folders.length) return "Nothing synced yet"
  if (s.pausedUntil >= FOREVER) return "Paused"
  if (s.pausedUntil > Date.now()) {
    const until = new Date(s.pausedUntil)
    const today = until.getDate() === new Date().getDate()
    return `Paused until ${today ? until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "tomorrow"}`
  }
  if (s.hours && !inHours(s.hours, new Date())) return `Waiting until ${s.hours.from}`
  const all = s.folders.map((f) => folders.statusOf(f.id))
  return all.includes("error") ? "Sync problem" : all.includes("syncing") ? "Syncing" : "Up to date"
}

// ------------------------------------------------------------------ tray

const icon = nativeImage.createFromPath(path.join(here, "../ui/icon.png"))
let tray: Tray | null = null
let trayShows = ""

// The user closing the drop zone themselves turns it off. Quitting closes it
// too, and that isn't them: it should be back next time.
let quitting = false
const dropZoneClosed = () => {
  if (quitting) return
  writeSettings({ ...readSettings(), dropZone: false })
  refreshTray()
}

function setDropZone(on: boolean) {
  writeSettings({ ...readSettings(), dropZone: on })
  drive.dropZone(on, dropZoneClosed)
  refreshTray()
}

function refreshTray() {
  if (!tray) return
  const s = readSettings()
  const title = `DarkDrive ${app.getVersion()} — ${status(s)}`
  const { up, down } = speed()
  // Linux tray icons often never deliver clicks, so everything lives in the menu.
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: title, enabled: false },
    ...(up || down ? [{ label: `↑ ${rate(up)}   ↓ ${rate(down)}`, enabled: false }] : []),
    ...(updateReady
      ? [{ label: `Restart to update to ${updateReady}`, click: () => autoUpdater.quitAndInstall() }]
      : []),
    ...(s.folders.length
      ? [
          s.pausedUntil > Date.now()
            ? { label: "Resume all", click: () => pauseUntil(0) }
            : {
                label: "Pause all",
                submenu: [
                  { label: "For 1 hour", click: () => pauseUntil(Date.now() + HOUR_MS) },
                  { label: "Until tomorrow", click: () => pauseUntil(tomorrow()) },
                  { label: "Until I resume", click: () => pauseUntil(FOREVER) },
                ],
              },
          {
            label: "Open folder",
            submenu: s.folders.map((f) => ({ label: f.name, click: () => shell.openPath(f.dir) })),
          },
        ]
      : []),
    ...(recent.length
      ? [
          {
            label: "Recent activity",
            submenu: recent.map((r) => ({
              label: `${r.dir === "up" ? "↑" : "↓"} ${path.basename(r.abs)}`,
              click: () => shell.showItemInFolder(r.abs),
            })),
          },
        ]
      : []),
    { label: "Open DarkDrive", click: () => drive.open() },
    { label: "Sync settings…", click: () => drive.open("/sync") },
    // It uploads as whoever is signed in, so there has to be someone.
    { label: "Drop zone", type: "checkbox", checked: s.dropZone, enabled: !!s.token, click: () => setDropZone(!readSettings().dropZone) },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]
  // Only when it would read differently: this also runs on a timer (the
  // speed, a pause running out), and a menu replaced while open closes.
  const shows = JSON.stringify(template)
  if (shows === trayShows) return
  trayShows = shows
  tray.setToolTip(title)
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

// ----------------------------------------------------------- links & args
// What a copy of the app can be started with: a darkdrive:// link (a browser
// handing over to the app), or an action from the file manager's right-click
// menu (filemanager.ts). With the app already running, that copy passes its
// arguments to this one ("second-instance", below) and quits.

/**
 * darkdrive://file/<id>, darkdrive://folder/<id>, darkdrive://share/<token>.
 * Anyone can write one, so all a link can do is show something: it picks a
 * page of the web app, by an id that's checked to be only an id.
 */
async function openLink(link: string) {
  let u: URL
  try {
    u = new URL(link)
  } catch {
    return drive.open()
  }
  const id = /^\/([\w-]+)\/?$/.exec(u.pathname)?.[1]
  if (id && u.host === "folder") return drive.open(`/drive/${id}`)
  if (id && u.host === "share") return drive.open(`/s/${id}`)
  if (id && u.host === "file") {
    // The web app shows a file in its folder, which the link doesn't say.
    const file = await apiCall<{ folderId: string }>(readSettings(), "GET", `/api/files/${id}`).catch(() => null)
    if (file) return drive.open(`/drive/${file.folderId}?file=${id}`)
    note("Couldn't open that link", "The file isn't in your DarkDrive, or DarkDrive can't be reached.")
  }
  drive.open()
}

// One at a time: adding a folder reads the settings, asks the server, then
// writes them, and Explorer starts a copy of the app per selected folder.
let syncing: Promise<unknown> = Promise.resolve()

function syncFolder(dir: string) {
  syncing = syncing.then(async () => {
    const s = readSettings()
    if (!s.token) return void drive.open()
    try {
      if (!fs.statSync(dir).isDirectory()) throw new Error("Only folders can be synced.")
      await folders.addLocal(s, dir)
      note("Syncing with DarkDrive", dir, () => drive.open("/sync"))
    } catch (e) {
      note("Couldn't sync that folder", (e as Error).message)
    }
  })
}

function openLocal(p: string) {
  const route = folders.routeOf(readSettings(), p)
  if (route) drive.open(route)
  else note("Not in DarkDrive yet", `"${path.basename(p)}" isn't in a synced folder, or hasn't synced yet.`)
}

/** Act on what a copy of the app was started with. False if that was nothing in particular. */
function handle(argv: string[]): boolean {
  const link = argv.find((a) => a.startsWith("darkdrive://"))
  // A link, and only a link: whatever else is on its command line may have
  // been put there by whoever wrote it (CVE-2018-1000006), and the actions
  // below are for the file manager alone. On Windows Electron already won't
  // start with anything after a URL; this is the same rule everywhere else.
  if (link) {
    void openLink(link)
    return true
  }
  const at = argv.findIndex((a) => a.startsWith("--dd-"))
  if (at < 0) return false
  const paths = argv.slice(at + 1).filter((a) => path.isAbsolute(a))
  if (argv[at] === "--dd-sync") paths.forEach(syncFolder)
  else if (argv[at] === "--dd-open" && paths[0]) openLocal(paths[0])
  else if (argv[at] === "--dd-toggle") pauseUntil(readSettings().pausedUntil > Date.now() ? 0 : FOREVER)
  return true
}

// ------------------------------------------------------------------- lan

// Set once the app is ready. Finds this account's other computers on the
// network and serves them synced files; the daemons fetch from the peers it
// finds (folders.setLan).
let lanSync: ReturnType<typeof lan.start> | null = null

const lanKey = async () => {
  const s = readSettings()
  return s.token ? (await apiCall<{ key: string }>(s, "GET", "/api/sync/lan-key")).key : null
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
  const s = readSettings()
  const { apiUrl, webUrl, device, folders: list, pausedUntil, hours } = s
  return {
    apiUrl, webUrl, device, folders: list, pausedUntil, hours, log, updateReady, signInUrl,
    syncing: folders.isRunning(), status: status(s), version: app.getVersion(),
  }
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
  // Signing out of a temporary login ends it for good, not just here.
  if (tempSession)
    await fetch(`${httpUrl(old.apiUrl)}/api/auth/logout`, { method: "POST", headers: { Cookie: tempSession } }).catch(() => {})
  await saveAccount({ token: "", deviceId: "" })
  await revoke(old)
})

// Answers the claim's HTTP status, which the web app's /t page puts in words.
bridge("temp-sign-in", async (code: string) => {
  const s = readSettings()
  // Like a browser already signed in: a login code is for another device, and
  // this one belongs to someone whose sync would keep running underneath.
  if (s.token) return 409
  const r = await fetch(`${httpUrl(s.apiUrl)}/api/temp-sessions/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: String(code) }),
  })
  if (!r.ok) return r.status
  tempSession = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
  drive.authorize(s, tempSession)
  return 200
})

// Where this computer signs in. A token is only good on the server that made it.
bridge("save-server", async (a: { apiUrl: string; webUrl: string; device: string }) => {
  const old = readSettings()
  const moved = httpUrl(String(a.apiUrl)) !== httpUrl(old.apiUrl)
  await saveAccount({ apiUrl: a.apiUrl, webUrl: a.webUrl, device: a.device, ...(moved && { token: "", deviceId: "" }) })
  if (moved) await revoke(old)
})

// Infinity is "until I resume": writeSettings caps it at FOREVER.
bridge("pause-until", (until: number) => pauseUntil(Number(until) || 0))
bridge("sync-hours", (h: Hours | null) => {
  if (h && !(isTime(h.from) && isTime(h.to))) throw new Error("Those aren't times.")
  writeSettings({ ...readSettings(), hours: h && { from: h.from, to: h.to } })
  applySchedule()
  refresh()
})
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
// By id, never by a path from the page: main finds the path itself.
bridge("local-path", (type: "file" | "folder", id: string) => folders.localPath(readSettings(), type, id))
bridge("show", (type: "file" | "folder", id: string) => {
  const p = folders.localPath(readSettings(), type, id)
  if (!p) throw new Error("That isn't on this computer.")
  if (type === "folder") shell.openPath(p)
  else shell.showItemInFolder(p)
})

// This computer's own files, for the web app's /local page. These take paths
// from the page, so local.ts is careful with each.
bridge("local:list", (dir?: string, hidden?: boolean) => local.list(readSettings(), dir, hidden))
bridge("local:measure", (dir: string) => local.measure(dir))
bridge("local:new-folder", (dir: string, name: string) => local.newFolder(dir, name))
bridge("local:rename", (p: string, name: string) => local.rename(readSettings(), p, name))
bridge("local:trash", (paths: string[]) => local.trash(readSettings(), paths))
bridge("local:open", (p: string) => local.open(p))
bridge("local:show", (p: string) => local.show(p))
bridge("local:sync", (dir: string) => local.sync(readSettings(), dir))

// ------------------------------------------------------------------ main

// Two copies would run two daemons over each state file.
// A second copy hands this one its own argv: the one Electron passes along
// has been through Chromium, which reorders and adds to it.
if (!app.requestSingleInstanceLock({ argv: process.argv })) app.quit()
else {
  app.on("second-instance", (_e, argv, _cwd, data) => {
    if (!handle((data as { argv?: string[] } | null)?.argv ?? argv)) drive.open()
  })
  // Closing the window leaves sync running in the tray; Quit is in its menu.
  app.on("window-all-closed", () => {})
  app.on("before-quit", () => {
    quitting = true
    void folders.pause()
  })
  app.whenReady().then(() => {
    tray = new Tray(icon.resize({ width: 22, height: 22 }))
    tray.on("click", () => drive.open())
    refreshTray()
    drive.setup()
    drive.authorize(readSettings())
    applySchedule()
    setInterval(applySchedule, SCHEDULE_CHECK_MS)
    setInterval(refreshTray, TRAY_TICK_MS)
    const look = () => void checkNotifications().catch(() => {})
    look()
    setInterval(look, NOTIFICATIONS_CHECK_MS)
    lanSync = lan.start({ key: lanKey, files: () => folders.files(readSettings()), onChange: folders.setLan })
    // Dev runs would register the bare electron binary, and have nothing to update.
    if (app.isPackaged) {
      registerAutostart()
      // Windows' right-click actions are the installer's (build/installer.nsh).
      app.setAsDefaultProtocolClient("darkdrive")
      try {
        if (fileManager.install())
          note(
            "DarkDrive was added to Files",
            "Click to restart Files, so its right-click actions and sync emblems show up. Open Files windows will close.",
            () => spawn("nautilus", ["-q"], { stdio: "ignore" }).on("error", () => {})
          )
      } catch (e) {
        addLine(`[desktop] couldn't set up the file manager: ${(e as Error).message}`)
      }
      checkForUpdates()
      setInterval(checkForUpdates, UPDATE_CHECK_MS)
    }
    const s = readSettings()
    if (s.dropZone && s.token) drive.dropZone(true, dropZoneClosed)
    // A link or a right-click action is what this launch is for. Otherwise
    // --hidden is for launching at login: straight to the tray, unless
    // there's no sign-in yet to sync with.
    if (!handle(process.argv) && (!s.token || !process.argv.includes("--hidden"))) drive.open()
  })
}
