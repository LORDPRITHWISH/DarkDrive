import { Directory, File } from "expo-file-system"
import { fetch } from "expo/fetch"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import { decidePull, decidePush } from "@workspace/sync-core"
import { api, ApiError, apiBase, authHeaders, configure } from "./api"
import { ROOT, loadState, saveState, loadCredentials, type Entry, type SyncState } from "./state"

// Mirrors apps/sync (the desktop daemon) beat for beat — same delta feed, same
// hash-based change detection, and crucially the same decidePull/decidePush
// from @workspace/sync-core, so the two clients can never disagree about what
// counts as a conflict. Only the filesystem layer differs.

type RemoteFile = {
  id: string; path: string; size: number; sha256: string | null
  mimeType: string; updatedAt: string; deleted: boolean
}
type RemoteFolder = { id: string; path: string; deleted: boolean }

export type Progress = (line: string) => void

const fileAt = (rel: string) => new File(ROOT, ...rel.split("/"))
const dirAt = (rel: string) => new Directory(ROOT, ...rel.split("/"))

// expo-file-system has no digest of its own, and one-shot hashing would mean
// holding an entire video in memory. Reading through a FileHandle in 1MB
// blocks keeps this flat regardless of file size.
const HASH_BLOCK = 1024 * 1024

function hashOf(file: File): string {
  const h = sha256.create()
  const handle = file.open()
  try {
    for (;;) {
      const block = handle.readBytes(HASH_BLOCK)
      if (block.length === 0) break
      h.update(block)
    }
  } finally {
    handle.close()
  }
  return bytesToHex(h.digest())
}

function walk() {
  const files = new Map<string, File>()
  const dirs = new Set<string>()
  const recurse = (dir: Directory, rel: string) => {
    for (const item of dir.list()) {
      const childRel = rel ? `${rel}/${item.name}` : item.name
      if (item instanceof Directory) {
        dirs.add(childRel)
        recurse(item, childRel)
      } else {
        files.set(childRel, item)
      }
    }
  }
  recurse(ROOT, "")
  return { files, dirs }
}

function conflictName(rel: string, device: string): string {
  const dot = rel.lastIndexOf(".")
  const slash = rel.lastIndexOf("/")
  const ext = dot > slash ? rel.slice(dot) : ""
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  return `${rel.slice(0, rel.length - ext.length)} (conflict from ${device} ${stamp})${ext}`
}

// ------------------------------------------------------------------ pull

async function download(f: RemoteFile, state: SyncState, log: Progress) {
  const dir = f.path.includes("/") ? dirAt(f.path.slice(0, f.path.lastIndexOf("/"))) : ROOT
  if (!dir.exists) dir.create({ intermediates: true })
  const target = fileAt(f.path)
  if (target.exists) target.delete()
  await File.downloadFileAsync(`${apiBase()}/api/files/${f.id}/download`, target, {
    headers: authHeaders(),
  })
  state.files[f.path] = {
    id: f.id,
    sha: f.sha256 ?? (hashOf(target)),
    size: target.size ?? f.size,
  }
  log(`↓ ${f.path}`)
}

function reprefix(state: SyncState, from: string, to: string) {
  for (const [rel, entry] of Object.entries(state.files)) {
    if (!rel.startsWith(from + "/")) continue
    delete state.files[rel]
    state.files[to + rel.slice(from.length)] = entry
  }
  for (const [id, p] of Object.entries(state.folders)) {
    if (p.startsWith(from + "/")) state.folders[id] = to + p.slice(from.length)
  }
}

async function pull(state: SyncState, device: string, log: Progress) {
  const data = await api<{ cursor: string; folders: RemoteFolder[]; files: RemoteFile[] }>(
    "GET",
    `/api/sync/changes?since=${encodeURIComponent(state.cursor)}`
  )

  for (const f of data.folders) {
    const prev = state.folders[f.id]
    if (f.deleted) {
      if (prev) {
        const dir = dirAt(prev)
        // Only when empty — files still inside haven't synced away yet.
        if (dir.exists && dir.list().length === 0) dir.delete()
        delete state.folders[f.id]
      }
      continue
    }
    const dir = dirAt(f.path)
    const old = prev ? dirAt(prev) : null
    if (old && prev !== f.path && old.exists) {
      old.moveSync(dir)
      reprefix(state, prev!, f.path)
      log(`↳ ${prev} → ${f.path}`)
    } else if (!dir.exists) {
      dir.create({ intermediates: true })
    }
    state.folders[f.id] = f.path
  }

  // A file moved server-side arrives at its new path; clear the stale entry
  // first or push() would read the gap as a local delete and trash it.
  const byId = new Map(Object.entries(state.files).map(([rel, e]) => [e.id, rel]))
  for (const f of data.files) {
    const oldRel = byId.get(f.id)
    if (!oldRel || oldRel === f.path) continue
    const entry = state.files[oldRel]
    const oldFile = fileAt(oldRel)
    if (!f.deleted && oldFile.exists && hashOf(oldFile) === entry.sha) {
      const dir = f.path.includes("/") ? dirAt(f.path.slice(0, f.path.lastIndexOf("/"))) : ROOT
      if (!dir.exists) dir.create({ intermediates: true })
      oldFile.moveSync(fileAt(f.path))
      state.files[f.path] = entry
    }
    delete state.files[oldRel]
  }

  for (const f of data.files) {
    const target = fileAt(f.path)
    const known = state.files[f.path]?.sha
    const local = target.exists ? hashOf(target) : null
    switch (decidePull(local, known, { sha: f.sha256, deleted: f.deleted })) {
      case "download":
        await download(f, state, log)
        break
      case "conflict": {
        const kept = conflictName(f.path, device)
        target.moveSync(fileAt(kept))
        delete state.files[f.path]
        log(`! kept your copy as ${kept}`)
        await download(f, state, log)
        break
      }
      case "delete-local":
        target.delete()
        delete state.files[f.path]
        log(`✕ ${f.path}`)
        break
      case "keep-local":
        delete state.files[f.path] // now local-only; push re-adds it
        break
      case "skip":
        if (local !== null && !f.deleted) {
          state.files[f.path] = { id: f.id, sha: local, size: target.size ?? f.size }
        } else if (f.deleted) {
          delete state.files[f.path]
        }
        break
    }
  }

  state.cursor = data.cursor
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

async function upload(
  rel: string, file: File, sha: string, state: SyncState, device: string,
  log: Progress, replace?: Entry
) {
  const size = file.size ?? 0
  const name = rel.slice(rel.lastIndexOf("/") + 1)
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ""

  const moveAside = () => {
    const kept = conflictName(rel, device)
    file.moveSync(fileAt(kept))
    delete state.files[rel]
    log(`! kept your copy as ${kept}`)
  }

  let init: { uploadId: string; chunkSize: number }
  try {
    init = await api("POST", "/api/files/upload/init", {
      name,
      size,
      ...(replace
        ? { replaceFileId: replace.id, expectedSha256: replace.sha }
        : { folderId: await ensureFolder(dir) }),
    })
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return moveAside()
    throw e
  }

  const total = Math.max(1, Math.ceil(size / init.chunkSize))

  try {
    for (let i = 0; i < total; i++) {
      const form = new FormData()
      form.append("chunkIndex", String(i))
      // File extends Blob here, so a single-chunk upload sends the file itself
      // and a multi-chunk one slices it — either way the bytes stream from
      // disk rather than through JS memory.
      const part = total === 1 ? file : file.slice(i * init.chunkSize, (i + 1) * init.chunkSize)
      form.append("chunk", part as any, name)
      const res = await fetch(`${apiBase()}/api/files/upload/${init.uploadId}/chunk`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      })
      if (!res.ok) throw new ApiError(`chunk ${i} of ${rel} -> ${res.status}`, res.status)
    }
    const done = await api<{ file: { id: string } }>(
      "POST",
      `/api/files/upload/${init.uploadId}/complete`,
      { totalChunks: total }
    )
    state.files[rel] = { id: done.file.id, sha, size }
    log(`↑ ${rel}`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return moveAside()
    await api("DELETE", `/api/files/upload/${init.uploadId}`).catch(() => {})
    throw e
  }
}

async function push(state: SyncState, device: string, log: Progress) {
  const { files: disk, dirs } = walk()

  // Gone from disk: either deleted, or the source half of a move. Indexed by
  // hash so a rename is a metadata PATCH rather than re-uploading over
  // cellular data.
  const missing = new Map<string, Entry>()
  for (const [rel, entry] of Object.entries(state.files))
    if (!disk.has(rel)) missing.set(rel, entry)
  const movedFrom = new Map<string, string[]>()
  for (const [rel, entry] of missing)
    movedFrom.set(entry.sha, [...(movedFrom.get(entry.sha) ?? []), rel])

  for (const [rel, file] of disk) {
    const known = state.files[rel]
    const sha = hashOf(file)
    switch (decidePush(sha, known?.sha)) {
      case "upload-new": {
        const from = movedFrom.get(sha)?.pop()
        if (from !== undefined) {
          const entry = missing.get(from)!
          const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ""
          await api("PATCH", `/api/files/${entry.id}`, {
            name: rel.slice(rel.lastIndexOf("/") + 1),
            folderId: await ensureFolder(dir),
          })
          delete state.files[from]
          state.files[rel] = { ...entry, size: file.size ?? 0 }
          missing.delete(from)
          log(`→ ${rel}`)
        } else {
          await upload(rel, file, sha, state, device, log)
        }
        break
      }
      case "upload-replace":
        await upload(rel, file, sha, state, device, log, known)
        break
      case "skip":
        break
    }
  }

  for (const [rel, entry] of missing) {
    await api("PATCH", `/api/files/${entry.id}`, { isTrashed: true })
    delete state.files[rel]
    log(`⌫ ${rel}`)
  }

  const goneFolders = Object.entries(state.folders)
    .filter(([, rel]) => !dirs.has(rel))
    .sort((a, b) => b[1].split("/").length - a[1].split("/").length)
  for (const [id, rel] of goneFolders) {
    await api("PATCH", `/api/folders/${id}`, { isTrashed: true })
    delete state.folders[id]
    log(`⌫ ${rel}/`)
  }
}

// ------------------------------------------------------------------ main

let running = false

/** One full reconcile. Returns the number of changes applied. */
export async function syncOnce(log: Progress = () => {}): Promise<number> {
  // The UI button and the background task can both land here; a second pass
  // on top of a half-finished one would double-upload.
  if (running) return 0
  running = true
  try {
    const creds = await loadCredentials()
    if (!creds) return 0
    configure(creds.apiUrl, creds.token)
    if (!ROOT.exists) ROOT.create({ intermediates: true })

    let changes = 0
    const counted: Progress = (line) => {
      changes++
      log(line)
    }
    const state = loadState()
    await pull(state, creds.device, counted)
    saveState(state)
    await push(state, creds.device, counted)
    saveState(state)
    return changes
  } finally {
    running = false
  }
}
