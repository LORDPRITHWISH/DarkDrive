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
/** How a folder's sync is doing. "paused" is no daemon at all. */
export type Status = "syncing" | "synced" | "error" | "paused"
// What a daemon reports (apps/sync, "parent").
type Report =
  | { type: "bytes"; up: number; down: number }
  | { type: "file"; dir: "up" | "down"; path: string; sha: string }
  | { type: "conflict"; path: string; keptAs: string }
  | { type: "pass"; ok: true }
  | { type: "pass"; ok: false; error: string; status?: number; body: string }
// What a daemon last synced: its state.json. Paths are relative, "/"-separated.
type DaemonState = { files: Record<string, { id: string; sha: string }>; folders: Record<string, string> }

// A dropped connection fails a pass every few seconds until it's back, and
// usually is back; only one that stays down this many passes is worth telling
// anyone about. The server saying no (a status) is worth it at once.
const PASSES_BEFORE_FAILED = 12

// esbuild bundles this into dist/main.cjs, next to the daemon's dist/sync.mjs.
const DAEMON = path.join(__dirname, "sync.mjs")
const daemons = new Map<string, UtilityProcess>()
const statuses = new Map<string, Status>()
let paused = false
// Peers for LAN sync (lan.ts), passed on to every daemon as it is.
let lan: unknown = null

/**
 * "line": a daemon printed something. "change": the folders, or how they're
 * doing, changed. "bytes": sent and received since the last one. "file": one
 * went up or down (its path relative, its sha256). "done": a run of those
 * ended, with how many. "failed": sync has stopped working, with the server's
 * status and reply if it was the server saying no. "conflict": an edit here
 * lost to one elsewhere, and was kept under this relative path.
 */
export const events = new EventEmitter<{
  line: [string]
  change: []
  bytes: [number, number]
  file: [SyncedFolder, "up" | "down", string, string]
  done: [SyncedFolder, number]
  failed: [SyncedFolder, string, number | undefined, string]
  conflict: [SyncedFolder, string]
}>()

export const isRunning = () => daemons.size > 0
export const statusOf = (id: string): Status => statuses.get(id) ?? "paused"
const homeOf = (id: string) => path.join(FOLDERS_DIR, id)

// Parsed once per change: listing a folder asks about every file in it.
const states = new Map<string, { mtimeMs: number; state: DaemonState }>()

function readState(id: string): DaemonState | null {
  const file = path.join(homeOf(id), "state.json")
  const mtimeMs = fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs
  if (mtimeMs === undefined) return null // not synced yet
  const hit = states.get(id)
  if (hit?.mtimeMs === mtimeMs) return hit.state
  try {
    const state: DaemonState = JSON.parse(fs.readFileSync(file, "utf8"))
    states.set(id, { mtimeMs, state })
    return state
  } catch {
    return null
  }
}

/** What a daemon said, turned into the events above. */
function listen(f: SyncedFolder, child: UtilityProcess) {
  // Files moved since the last quiet pass, and how many of those the last
  // pass had already seen: equal and non-zero means the run is over.
  let moved = 0
  let movedAtPass = 0
  let failures = 0
  const set = (to: Status) => {
    if (statuses.get(f.id) === to) return
    statuses.set(f.id, to)
    events.emit("change")
  }
  set("syncing")
  child.on("message", (m: Report) => {
    if (m.type === "bytes") events.emit("bytes", m.up, m.down)
    else if (m.type === "conflict") events.emit("conflict", f, m.keptAs)
    else if (m.type === "file") {
      moved++
      set("syncing")
      events.emit("file", f, m.dir, m.path, m.sha)
    } else if (m.ok) {
      failures = 0
      if (moved && moved === movedAtPass) {
        events.emit("done", f, moved)
        moved = 0
      }
      movedAtPass = moved
      set(moved ? "syncing" : "synced")
    } else {
      set("error")
      if (++failures === (m.status ? 1 : PASSES_BEFORE_FAILED)) events.emit("failed", f, m.error, m.status, m.body)
    }
  })
  child.once("spawn", () => child.postMessage({ type: "lan", lan }))
}

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
  listen(f, child)
  const say = (line: string) => events.emit("line", `[${f.name}] ${line}`)
  for (const stream of [child.stdout, child.stderr])
    if (stream) readline.createInterface({ input: stream }).on("line", say)
  child.on("exit", (code) => {
    if (daemons.get(f.id) === child) {
      daemons.delete(f.id)
      statuses.delete(f.id)
    }
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

// Whether path `a` is `b` or inside it. Windows doesn't care about case in a
// path, and Explorer, a folder dialog and a saved setting don't always agree on it.
const fold = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p)
const within = (a: string, b: string) => fold(a) === fold(b) || fold(a).startsWith(fold(b) + path.sep)

// Two daemons over one tree would upload the shared files twice, into two
// different DarkDrive folders, and then both push every edit to them.
function assertFree(s: Settings, dir: string) {
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
 * Where a DarkDrive file or folder is on this computer, if a synced folder has
 * it here. Read from the daemons' own state (what they last synced, by id),
 * so it needs no server and only ever finds what really came down.
 */
export function localPath(s: Settings, type: "file" | "folder", id: string): string | null {
  for (const f of s.folders) {
    let rel: string | undefined = type === "folder" && f.id === id ? "" : undefined
    if (rel === undefined) {
      const state = readState(f.id)
      if (!state) continue
      rel = type === "folder" ? state.folders[id] : Object.keys(state.files).find((r) => state.files[r].id === id)
    }
    if (rel === undefined) continue
    const abs = path.join(f.dir, ...rel.split("/"))
    return fs.existsSync(abs) ? abs : null
  }
  return null
}

/**
 * The other way round: the web app route that shows a path on this computer,
 * a file open in its folder, or null if no synced folder has it (yet).
 */
export function routeOf(s: Settings, abs: string): string | null {
  const f = s.folders.find((f) => within(abs, f.dir))
  if (!f) return null
  const rel = path.relative(f.dir, abs).split(path.sep).join("/")
  if (!rel) return `/drive/${f.id}`
  const state = readState(f.id)
  if (!state) return null
  const folderId = (r: string) => (r === "." ? f.id : Object.keys(state.folders).find((id) => state.folders[id] === r))
  const file = state.files[rel]
  const folder = folderId(file ? path.posix.dirname(rel) : rel)
  return folder ? `/drive/${folder}${file ? `?file=${file.id}` : ""}` : null
}

/** Every file the daemons have synced, as [sha256, absolute path]: what LAN sync can serve. */
export function* files(s: Settings): Generator<[string, string]> {
  for (const f of s.folders)
    for (const [rel, entry] of Object.entries(readState(f.id)?.files ?? {})) yield [entry.sha, path.join(f.dir, ...rel.split("/"))]
}

/** Hand the daemons the LAN peers to fetch from (null: none, use the server). */
export function setLan(next: unknown) {
  lan = next
  for (const child of daemons.values()) child.postMessage({ type: "lan", lan })
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
