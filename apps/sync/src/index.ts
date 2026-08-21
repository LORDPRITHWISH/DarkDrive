#!/usr/bin/env node
// DarkDrive desktop sync daemon.
//
// Polls /api/sync/changes for remote edits and stat-walks the local folder for
// local ones, reconciling both against a state file of "what we last synced".
// No dependencies: Node 20+ has fetch/FormData/Blob, and the whole thing is
// stdlib otherwise.
//
// ponytail: stat-walk polling rather than fs.watch/chokidar. A walk that only
// hashes files whose size+mtime moved is cheap into the low thousands of
// files; swap in a watcher (and the existing Socket.IO `user:` room for the
// remote side) if the tree gets big or 5s latency stops being acceptable.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { decidePull, decidePush } from "@workspace/sync-core"

// DD_HOME lets one machine run several independent syncs (and makes the
// daemon testable without touching the real ~/.darkdrive).
const CONFIG_DIR = process.env.DD_HOME ?? path.join(os.homedir(), ".darkdrive")
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json")
const STATE_FILE = path.join(CONFIG_DIR, "state.json")
const POLL_MS = Number(process.env.DD_POLL_MS ?? 5000)
const PART_SUFFIX = ".dd-part"
const IGNORE = new Set([".darkdrive", ".DS_Store", "Thumbs.db", "desktop.ini", "$RECYCLE.BIN"])

type Config = { apiUrl: string; token: string; dir: string; device: string }
type Entry = { id: string; sha: string; size: number; mtimeMs: number }
type State = { cursor: string; files: Record<string, Entry>; folders: Record<string, string> }

// ---------------------------------------------------------------- config

const flag = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=")

function loadConfig(): Config {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  const saved = fs.existsSync(CONFIG_FILE)
    ? (JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Partial<Config>)
    : {}
  const cfg: Config = {
    apiUrl: (flag("api") ?? saved.apiUrl ?? "http://localhost:4000").replace(/\/+$/, ""),
    token: flag("token") ?? saved.token ?? "",
    dir: path.resolve(flag("dir") ?? saved.dir ?? path.join(os.homedir(), "DarkDrive")),
    device: flag("device") ?? saved.device ?? os.hostname(),
  }
  if (!cfg.token) {
    console.error(
      `No device token.\n\n` +
        `  1. Open ${cfg.apiUrl}/api/devices/pair in a browser you're signed into\n` +
        `  2. Create a token, then run:\n\n` +
        `     darkdrive-sync --token=dd_... --dir=${cfg.dir} --api=${cfg.apiUrl}\n`
    )
    process.exit(1)
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 })
  fs.mkdirSync(cfg.dir, { recursive: true })
  return cfg
}

const cfg = loadConfig()

function loadState(): State {
  if (!fs.existsSync(STATE_FILE)) return { cursor: new Date(0).toISOString(), files: {}, folders: {} }
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as State
}
let state = loadState()

function saveState() {
  const tmp = STATE_FILE + PART_SUFFIX
  fs.writeFileSync(tmp, JSON.stringify(state))
  fs.renameSync(tmp, STATE_FILE)
}

// ------------------------------------------------------------------- api

async function api<T = any>(method: string, route: string, body?: unknown): Promise<T> {
  const res = await fetch(cfg.apiUrl + route, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const err = Object.assign(new Error(`${method} ${route} -> ${res.status}`), {
      status: res.status,
      body: await res.text().catch(() => ""),
    })
    throw err
  }
  return res.json() as Promise<T>
}

// -------------------------------------------------------------- fs bits

/** Resolve a server-supplied relative path inside the sync dir, or throw. */
function localPath(rel: string): string {
  const abs = path.resolve(cfg.dir, ...rel.split("/"))
  // Trust boundary: the server is not allowed to talk us into writing outside
  // the synced folder, whatever it sends.
  if (abs !== cfg.dir && !abs.startsWith(cfg.dir + path.sep))
    throw new Error(`refusing path outside sync dir: ${rel}`)
  return abs
}

function hashFile(abs: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256")
    fs.createReadStream(abs)
      .on("data", (c) => h.update(c))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")))
  })
}

type DiskFile = { abs: string; size: number; mtimeMs: number }

function walk(): { files: Map<string, DiskFile>; dirs: Set<string> } {
  const files = new Map<string, DiskFile>()
  const dirs = new Set<string>()
  const recurse = (abs: string, rel: string) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (IGNORE.has(e.name) || e.name.endsWith(PART_SUFFIX)) continue
      const childRel = rel ? `${rel}/${e.name}` : e.name
      const childAbs = path.join(abs, e.name)
      if (e.isDirectory()) {
        dirs.add(childRel)
        recurse(childAbs, childRel)
      } else if (e.isFile()) {
        const st = fs.statSync(childAbs)
        files.set(childRel, { abs: childAbs, size: st.size, mtimeMs: st.mtimeMs })
      }
      // Symlinks are skipped on purpose — following them would sync bytes
      // that live outside the folder the user pointed us at.
    }
  }
  recurse(cfg.dir, "")
  return { files, dirs }
}

function conflictName(rel: string): string {
  const ext = path.posix.extname(rel)
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  return `${rel.slice(0, rel.length - ext.length)} (conflict from ${cfg.device} ${stamp})${ext}`
}

/** Move a locally-edited file aside so the server's copy can land. */
function moveAside(rel: string): string {
  const to = conflictName(rel)
  fs.renameSync(localPath(rel), localPath(to))
  delete state.files[rel]
  console.log(`  ! conflict: kept your copy as ${to}`)
  return to
}

// ------------------------------------------------------------------ pull

type RemoteFile = {
  id: string; path: string; size: number; sha256: string | null
  mimeType: string; updatedAt: string; deleted: boolean
}
type RemoteFolder = { id: string; path: string; deleted: boolean }

async function download(f: RemoteFile) {
  const abs = localPath(f.path)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const res = await fetch(`${cfg.apiUrl}/api/files/${f.id}/download`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  })
  if (!res.ok || !res.body) throw new Error(`download ${f.path} -> ${res.status}`)
  // Straight to a .dd-part and renamed on success, so a killed transfer never
  // leaves a truncated file for the next push to upload as "an edit".
  const tmp = abs + PART_SUFFIX
  await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(tmp))
  fs.renameSync(tmp, abs)
  const st = fs.statSync(abs)
  state.files[f.path] = {
    id: f.id,
    sha: f.sha256 ?? (await hashFile(abs)),
    size: st.size,
    mtimeMs: st.mtimeMs,
  }
  console.log(`  ↓ ${f.path}`)
}

/** Re-key state under a folder that moved, so its children stay tracked. */
function reprefix(from: string, to: string) {
  for (const [rel, entry] of Object.entries(state.files)) {
    if (!rel.startsWith(from + "/")) continue
    delete state.files[rel]
    state.files[to + rel.slice(from.length)] = entry
  }
  for (const [id, p] of Object.entries(state.folders)) {
    if (p.startsWith(from + "/")) state.folders[id] = to + p.slice(from.length)
  }
}

async function pull() {
  const data = await api<{ cursor: string; folders: RemoteFolder[]; files: RemoteFile[] }>(
    "GET",
    `/api/sync/changes?since=${encodeURIComponent(state.cursor)}`
  )

  // Folders first: creating and moving directories before the files that go
  // in them means a renamed folder carries its children on disk for free.
  for (const f of data.folders) {
    const prev = state.folders[f.id]
    if (f.deleted) {
      // Only if empty — a directory still holding files means those files
      // haven't been synced away yet, and rm -rf would take them with it.
      if (prev) {
        const abs = localPath(prev)
        if (fs.existsSync(abs) && fs.readdirSync(abs).length === 0) fs.rmSync(abs, { recursive: true })
        delete state.folders[f.id]
      }
      continue
    }
    const abs = localPath(f.path)
    if (prev && prev !== f.path && fs.existsSync(localPath(prev))) {
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.renameSync(localPath(prev), abs)
      reprefix(prev, f.path)
      console.log(`  ↳ ${prev} → ${f.path}`)
    } else {
      fs.mkdirSync(abs, { recursive: true })
    }
    state.folders[f.id] = f.path
  }

  // A file that moved server-side arrives at its new path; find and clear the
  // stale entry first, or push() would read the gap at the old path as a
  // local delete and trash the file we just moved.
  const byId = new Map(Object.entries(state.files).map(([rel, e]) => [e.id, rel]))
  for (const f of data.files) {
    const oldRel = byId.get(f.id)
    if (!oldRel || oldRel === f.path) continue
    const entry = state.files[oldRel]
    const oldAbs = localPath(oldRel)
    // Only relocate a copy we know is unmodified; an edited one stays put and
    // gets pushed on its own terms.
    if (fs.existsSync(oldAbs) && (await hashFile(oldAbs)) === entry.sha && !f.deleted) {
      fs.mkdirSync(path.dirname(localPath(f.path)), { recursive: true })
      fs.renameSync(oldAbs, localPath(f.path))
      state.files[f.path] = entry
    }
    delete state.files[oldRel]
  }

  for (const f of data.files) {
    const abs = localPath(f.path)
    const known = state.files[f.path]?.sha
    const local = fs.existsSync(abs) ? await hashFile(abs) : null
    switch (decidePull(local, known, { sha: f.sha256, deleted: f.deleted })) {
      case "download":
        await download(f)
        break
      case "conflict":
        moveAside(f.path)
        await download(f)
        break
      case "delete-local": {
        fs.rmSync(abs)
        delete state.files[f.path]
        console.log(`  ✕ ${f.path}`)
        break
      }
      case "keep-local":
        delete state.files[f.path] // now a local-only file; push will re-add it
        break
      case "skip":
        if (local !== null && !f.deleted) {
          const st = fs.statSync(abs)
          state.files[f.path] = { id: f.id, sha: local, size: st.size, mtimeMs: st.mtimeMs }
        } else if (f.deleted) {
          delete state.files[f.path]
        }
        break
    }
  }

  state.cursor = data.cursor
  saveState()
}

// ------------------------------------------------------------------ push

const folderIds = new Map<string, string>()
async function ensureFolder(rel: string): Promise<string> {
  const hit = folderIds.get(rel)
  if (hit) return hit
  const { id } = await api<{ id: string }>("POST", "/api/sync/folder", { path: rel })
  folderIds.set(rel, id)
  return id
}

async function upload(rel: string, info: DiskFile, sha: string, replace?: Entry) {
  const name = path.posix.basename(rel)
  const dir = path.posix.dirname(rel)
  let init: { uploadId: string; chunkSize: number }
  try {
    init = await api("POST", "/api/files/upload/init", {
      name,
      size: info.size,
      ...(replace
        ? { replaceFileId: replace.id, expectedSha256: replace.sha }
        : { folderId: await ensureFolder(dir === "." ? "" : dir) }),
    })
  } catch (e: any) {
    // Someone else changed the file after we last saw it. Keep ours under a
    // conflict name; the next pull brings theirs down.
    if (e.status === 409) return void moveAside(rel)
    throw e
  }

  const fd = fs.openSync(info.abs, "r")
  try {
    const total = Math.max(1, Math.ceil(info.size / init.chunkSize))
    for (let i = 0; i < total; i++) {
      const offset = i * init.chunkSize
      const buf = Buffer.alloc(Math.min(init.chunkSize, Math.max(0, info.size - offset)))
      if (buf.length) fs.readSync(fd, buf, 0, buf.length, offset)
      const form = new FormData()
      form.set("chunkIndex", String(i))
      form.set("chunk", new Blob([buf]), name)
      const res = await fetch(`${cfg.apiUrl}/api/files/upload/${init.uploadId}/chunk`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.token}` },
        body: form,
      })
      if (!res.ok) throw new Error(`chunk ${i} of ${rel} -> ${res.status}`)
    }
    const done = await api<{ file: { id: string } }>(
      "POST",
      `/api/files/upload/${init.uploadId}/complete`,
      { totalChunks: total }
    )
    state.files[rel] = { id: done.file.id, sha, size: info.size, mtimeMs: info.mtimeMs }
    console.log(`  ↑ ${rel}`)
  } catch (e: any) {
    if (e.status === 409) return void moveAside(rel)
    await api("DELETE", `/api/files/upload/${init.uploadId}`).catch(() => {})
    throw e
  } finally {
    fs.closeSync(fd)
  }
}

/** Same bytes, new path: a metadata update, not a re-upload. */
async function move(from: string, to: string, info: DiskFile, entry: Entry) {
  const dir = path.posix.dirname(to)
  await api("PATCH", `/api/files/${entry.id}`, {
    name: path.posix.basename(to),
    folderId: await ensureFolder(dir === "." ? "" : dir),
  })
  delete state.files[from]
  state.files[to] = { ...entry, size: info.size, mtimeMs: info.mtimeMs }
  console.log(`  → ${to}`)
}

async function push() {
  const { files: disk, dirs } = walk()

  // Paths we last synced that are gone from disk: either deleted, or the
  // source half of a move. Indexed by content hash so a file that reappears
  // elsewhere is recognised — otherwise renaming a folder would re-upload
  // every byte under it and trash the originals.
  const missing = new Map<string, Entry>()
  for (const [rel, entry] of Object.entries(state.files))
    if (!disk.has(rel)) missing.set(rel, entry)
  const movedFrom = new Map<string, string[]>()
  for (const [rel, entry] of missing)
    movedFrom.set(entry.sha, [...(movedFrom.get(entry.sha) ?? []), rel])

  for (const [rel, info] of disk) {
    const known = state.files[rel]
    // The whole point of tracking size+mtime: skip the hash entirely for the
    // overwhelming majority of files, which haven't changed.
    const unchanged = known && known.size === info.size && known.mtimeMs === info.mtimeMs
    const sha = unchanged ? known.sha : await hashFile(info.abs)
    switch (decidePush(sha, known?.sha)) {
      case "upload-new": {
        const from = movedFrom.get(sha)?.pop()
        if (from !== undefined) {
          await move(from, rel, info, missing.get(from)!)
          missing.delete(from)
        } else {
          await upload(rel, info, sha)
        }
        break
      }
      case "upload-replace":
        await upload(rel, info, sha, known)
        break
      case "skip":
        state.files[rel] = { ...known!, size: info.size, mtimeMs: info.mtimeMs }
        break
    }
  }

  // Whatever is still missing after move detection really was deleted.
  for (const [rel, entry] of missing) {
    await api("PATCH", `/api/files/${entry.id}`, { isTrashed: true })
    delete state.files[rel]
    console.log(`  ⌫ ${rel}`)
  }

  // Deepest first, so a removed tree trashes leaves before their parents.
  const goneFolders = Object.entries(state.folders)
    .filter(([, rel]) => !dirs.has(rel))
    .sort((a, b) => b[1].split("/").length - a[1].split("/").length)
  for (const [id, rel] of goneFolders) {
    await api("PATCH", `/api/folders/${id}`, { isTrashed: true })
    delete state.folders[id]
    console.log(`  ⌫ ${rel}/`)
  }

  saveState()
}

// ------------------------------------------------------------------ main

let stopping = false
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    stopping = true
    saveState()
    process.exit(0)
  })

// --once reconciles a single time and exits, for anyone who'd rather run this
// from cron/systemd-timer than keep a process alive.
const once = process.argv.includes("--once")

console.log(`[darkdrive] syncing ${cfg.dir} <-> ${cfg.apiUrl} as "${cfg.device}"`)
do {
  try {
    await pull()
    await push()
  } catch (e: any) {
    // Transient failures (server restart, laptop lid) must not kill the
    // daemon — the next tick re-reconciles from the same state file.
    console.error(`[darkdrive] ${e.message}${e.body ? ` ${e.body}` : ""}`)
    if (once) process.exit(1)
  }
  if (!once) await new Promise((r) => setTimeout(r, POLL_MS))
} while (!once && !stopping)
