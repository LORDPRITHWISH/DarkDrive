// Synced folders. Each pairs a folder on this computer with one folder in
// DarkDrive's "Synced Folders", and gets its own copy of the sync daemon
// (apps/sync) in a utility process with its own DD_HOME. The daemon was built
// for that, one config and state file per DD_HOME, so it has no idea there
// are several, and a folder whose disk or DarkDrive side breaks can only take
// down its own process.
//
// ponytail: one process per folder, ~30MB each. Fine for a handful; fold them
// into one daemon that loops over folders if people start syncing dozens.
import { utilityProcess, type UtilityProcess } from "electron"
import { EventEmitter } from "node:events"
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import { apiCall, FOLDERS_DIR, writeSettings, type Settings, type SyncedFolder } from "./settings.js"

type Remote = { id: string; name: string }

// esbuild bundles this into dist/main.cjs, next to the daemon's dist/sync.mjs.
const DAEMON = path.join(__dirname, "sync.mjs")
const daemons = new Map<string, UtilityProcess>()
let paused = false

/** "line": a daemon printed something. "change": the folders, or which of them run, changed. */
export const events = new EventEmitter<{ line: [string]; change: [] }>()

export const isRunning = () => daemons.size > 0
const homeOf = (id: string) => path.join(FOLDERS_DIR, id)

function start(s: Settings, f: SyncedFolder) {
  if (daemons.has(f.id)) return
  const home = homeOf(f.id)
  fs.mkdirSync(home, { recursive: true })
  // Rewritten on every start, so a new token or device name reaches them all.
  const config = { apiUrl: s.apiUrl, token: s.token, device: s.device, dir: f.dir, remoteFolderId: f.id }
  fs.writeFileSync(path.join(home, "config.json"), JSON.stringify(config, null, 2), { mode: 0o600 })
  const child = utilityProcess.fork(DAEMON, [], {
    stdio: "pipe",
    serviceName: `DarkDrive sync: ${f.name}`,
    env: { ...process.env, DD_HOME: home },
  })
  daemons.set(f.id, child)
  const say = (line: string) => events.emit("line", `[${f.name}] ${line}`)
  for (const stream of [child.stdout, child.stderr])
    if (stream) readline.createInterface({ input: stream }).on("line", say)
  child.on("exit", (code) => {
    if (daemons.get(f.id) === child) daemons.delete(f.id)
    say(`sync stopped${code ? ` (exit ${code})` : ""}`)
    events.emit("change")
  })
  events.emit("change")
}

function stop(id: string): Promise<void> {
  const child = daemons.get(id)
  if (!child) return Promise.resolve()
  // SIGTERM on POSIX, which the daemon catches to save its state first.
  return new Promise((resolve) => {
    child.once("exit", () => resolve())
    child.kill()
  })
}

export function resume(s: Settings) {
  paused = false
  if (s.token) for (const f of s.folders) start(s, f)
}

export async function pause() {
  paused = true
  await Promise.all([...daemons.keys()].map(stop))
}

const listRemote = (s: Settings) => apiCall<Remote[]>(s, "GET", "/api/sync/folders")

/** Folders in DarkDrive's Synced Folders that this computer doesn't sync yet. */
export async function available(s: Settings): Promise<Remote[]> {
  return (await listRemote(s)).filter((r) => !s.folders.some((f) => f.id === r.id))
}

// Two daemons over one tree would upload the shared files twice, into two
// different DarkDrive folders, and then both push every edit to them.
function assertFree(s: Settings, dir: string) {
  const within = (a: string, b: string) => a === b || a.startsWith(b + path.sep)
  const clash = s.folders.find((f) => within(dir, f.dir) || within(f.dir, dir))
  if (clash) throw new Error(`That overlaps "${clash.name}" (${clash.dir}), which is already synced.`)
}

function add(s: Settings, f: SyncedFolder): SyncedFolder[] {
  const next = { ...s, folders: [...s.folders, f] }
  writeSettings(next)
  if (!paused) start(next, f)
  events.emit("change")
  return next.folders
}

/** Start syncing `dir` from this computer, as a new folder in Synced Folders. */
export async function addLocal(s: Settings, dir: string) {
  assertFree(s, dir)
  const made = await apiCall<Remote>(s, "POST", "/api/sync/folders", { name: path.basename(dir) })
  return add(s, { ...made, dir })
}

/** Start syncing a folder already in Synced Folders, into `parent`/<its name>. */
export function addRemote(s: Settings, remote: Remote, parent: string) {
  // The name comes from the server, and must not steer the path out of `parent`.
  if (path.basename(remote.name) !== remote.name || remote.name === "." || remote.name === "..")
    throw new Error(`"${remote.name}" can't be used as a folder name on this computer.`)
  const dir = path.join(parent, remote.name)
  assertFree(s, dir)
  return add(s, { ...remote, dir })
}

/** Stop syncing a folder. Its files stay where they are, here and on DarkDrive. */
export async function remove(s: Settings, id: string) {
  await stop(id)
  fs.rmSync(homeOf(id), { recursive: true, force: true })
  const folders = s.folders.filter((f) => f.id !== id)
  writeSettings({ ...s, folders })
  events.emit("change")
  return folders
}

/**
 * After a sign-in, keep only the folders this account has (another account's
 * would 404 on every poll) and pick up names changed on the web.
 */
export async function forAccount(s: Settings): Promise<SyncedFolder[]> {
  const names = new Map((await listRemote(s)).map((r) => [r.id, r.name]))
  for (const f of s.folders) if (!names.has(f.id)) fs.rmSync(homeOf(f.id), { recursive: true, force: true })
  return s.folders.filter((f) => names.has(f.id)).map((f) => ({ ...f, name: names.get(f.id)! }))
}
