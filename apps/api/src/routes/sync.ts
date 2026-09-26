import { Router } from "express"
import type { User } from "@prisma/client"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { assertUserRootFolderId, assertUserSyncRootId } from "../lib/access.js"

export const syncRouter = Router()
syncRouter.use(requireAuth)

// Guard against a parent cycle wedging the path walk. Nothing should create
// one (folders.ts rejects moves into a descendant), but an unbounded while
// loop on user-shaped data is not worth the risk.
const MAX_DEPTH = 64

type FolderRow = {
  id: string; name: string; parentId: string | null
  isTrashed: boolean; deletedAt: Date | null; updatedAt: Date
}

// Path of a folder relative to the drive root, POSIX-separated. "" is the
// root itself; null means the folder hangs off something outside this drive
// (a space, or a broken parent chain) and should be skipped.
function pathBuilder(byId: Map<string, FolderRow>, rootId: string) {
  const cache = new Map<string, string | null>([[rootId, ""]])
  return function pathOf(id: string): string | null {
    const seen: string[] = []
    let cur: string | null = id
    let out: string | null = null
    for (let i = 0; i < MAX_DEPTH; i++) {
      if (cur === null) break
      const hit = cache.get(cur)
      if (hit !== undefined) {
        out = hit
        break
      }
      const row = byId.get(cur)
      if (!row) break
      seen.push(cur)
      cur = row.parentId
    }
    // Unwind, filling the cache on the way back down.
    for (const ancestor of seen.reverse()) {
      if (out === null) break
      const row = byId.get(ancestor)!
      out = out === "" ? row.name : `${out}/${row.name}`
      cache.set(ancestor, out)
    }
    for (const ancestor of seen) if (!cache.has(ancestor)) cache.set(ancestor, null)
    return out
  }
}

// Every folder the user owns outside spaces. pathOf resolves paths within My
// Drive, syncedPathOf within "Synced Folders"; both return null for anything
// under another root (e.g. the photos root).
async function loadDrive(user: User) {
  const [driveRoot, syncedRoot] = await Promise.all([assertUserRootFolderId(user), assertUserSyncRootId(user)])
  const folders: FolderRow[] = await prisma.folder.findMany({
    where: { ownerId: user.id, spaceId: null },
    select: { id: true, name: true, parentId: true, isTrashed: true, deletedAt: true, updatedAt: true },
  })
  const byId = new Map(folders.map((f) => [f.id, f]))
  return {
    driveRoot, syncedRoot, folders, byId,
    pathOf: pathBuilder(byId, driveRoot),
    syncedPathOf: pathBuilder(byId, syncedRoot),
  }
}

// The folder a client syncs against: `root` if it names a live folder in the
// user's drive or in Synced Folders (the desktop app), the whole drive if
// it's absent (the mobile app). Anything else (someone else's folder, a
// space, the photos root, the bin) is refused outright, not quietly widened
// to the whole drive, which would pour every file onto a disk that asked for
// one folder.
function syncRoot(drive: Awaited<ReturnType<typeof loadDrive>>, raw: unknown): string | null {
  if (raw === undefined || raw === "") return drive.driveRoot
  const f = typeof raw === "string" ? drive.byId.get(raw) : undefined
  if (!f || f.isTrashed || f.deletedAt) return null
  if (drive.pathOf(f.id) === null && drive.syncedPathOf(f.id) === null) return null
  return f.id
}

// Everything in the user's own drive that changed since `since`, as paths.
// Deletes are included (isTrashed/deletedAt) so clients know to remove the
// local copy — no separate change journal is needed because every mutation
// already bumps updatedAt.
//
// A rename or move of a folder does NOT bump its descendants' updatedAt, so
// clients must handle a changed folder path by moving the local directory;
// the children then follow on disk for free.
//
// ?root=<folderId> scopes it to one folder: paths are relative to it and
// nothing outside it is reported.
syncRouter.get("/changes", async (req, res) => {
  const user = currentUser(req)
  const since = new Date(String(req.query.since ?? 0))
  if (Number.isNaN(since.getTime())) return res.status(400).json({ error: "bad_since" })

  // Captured before the reads: a row written mid-query is then re-delivered
  // next poll rather than missed. Applying a change twice is a no-op.
  const cursor = new Date()
  // Every folder, not just changed ones — needed to resolve parent chains.
  const drive = await loadDrive(user)
  const rootId = syncRoot(drive, req.query.root)
  if (!rootId) return res.status(404).json({ error: "sync_root_gone" })
  const { folders } = drive
  // Rooted at the sync folder, so anything outside it resolves to null and
  // is skipped below.
  const pathOf = pathBuilder(drive.byId, rootId)

  const files = await prisma.file.findMany({
    where: { ownerId: user.id, spaceId: null, updatedAt: { gt: since } },
    select: {
      id: true, name: true, folderId: true, size: true, sha256: true,
      mimeType: true, isTrashed: true, deletedAt: true, updatedAt: true,
    },
  })

  const changedFolders = []
  for (const f of folders) {
    if (f.updatedAt <= since || f.id === rootId) continue
    const p = pathOf(f.id)
    if (p === null || p === "") continue
    changedFolders.push({ id: f.id, path: p, deleted: f.isTrashed || f.deletedAt !== null })
  }

  const changedFiles = []
  for (const f of files) {
    const dir = pathOf(f.folderId)
    if (dir === null) continue
    changedFiles.push({
      id: f.id,
      path: dir === "" ? f.name : `${dir}/${f.name}`,
      size: Number(f.size),
      sha256: f.sha256,
      mimeType: f.mimeType,
      updatedAt: f.updatedAt,
      deleted: f.isTrashed || f.deletedAt !== null,
    })
  }

  // Shallowest first so a client can mkdir parents before children.
  changedFolders.sort((a, b) => a.path.split("/").length - b.path.split("/").length)

  res.json({ cursor: cursor.toISOString(), folders: changedFolders, files: changedFiles })
})

// The synced folders, for the desktop app's "sync one here" picker.
syncRouter.get("/folders", async (req, res) => {
  const parentId = await assertUserSyncRootId(currentUser(req))
  res.json(
    await prisma.folder.findMany({
      where: { parentId, isTrashed: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })
  )
})

// A new synced folder, for a folder the desktop app starts syncing from its
// computer. Two computers can each have an "Important Docs" with nothing in
// common, and quietly merging them would be a nasty surprise, so the second
// becomes "Important Docs (2)". Joining an existing one is the picker above.
syncRouter.post("/folders", async (req, res) => {
  const user = currentUser(req)
  const body = z.object({ name: z.string().trim().min(1).max(255) }).safeParse(req.body)
  if (!body.success || /[\\/]/.test(body.data.name) || body.data.name === "." || body.data.name === "..")
    return res.status(400).json({ error: "bad_name" })
  const parentId = await assertUserSyncRootId(user)
  const taken = new Set(
    (await prisma.folder.findMany({ where: { parentId, isTrashed: false }, select: { name: true } })).map((f) => f.name)
  )
  let name = body.data.name
  for (let i = 2; taken.has(name); i++) name = `${body.data.name} (${i})`
  res.status(201).json(
    await prisma.folder.create({ data: { name, ownerId: user.id, parentId }, select: { id: true, name: true } })
  )
})

// Resolve a path to a folder id, creating any missing segments. Sync clients
// work in paths; every other write endpoint works in folder ids. `root`
// scopes it the same way as /changes.
syncRouter.post("/folder", async (req, res) => {
  const user = currentUser(req)
  const body = z.object({ path: z.string().max(4096), root: z.string().optional() }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: "invalid" })
  const { path } = body.data
  const rootId = syncRoot(await loadDrive(user), body.data.root)
  if (!rootId) return res.status(404).json({ error: "sync_root_gone" })

  let parentId = rootId
  const parts = path.split("/").map((s) => s.trim()).filter(Boolean)
  if (parts.length > MAX_DEPTH) return res.status(400).json({ error: "too_deep" })

  for (const name of parts) {
    if (name === "." || name === "..") return res.status(400).json({ error: "bad_path" })
    const existing = await prisma.folder.findFirst({
      where: { ownerId: user.id, parentId, name, isTrashed: false },
      select: { id: true },
    })
    parentId = existing
      ? existing.id
      : (await prisma.folder.create({ data: { name, ownerId: user.id, parentId } })).id
  }
  res.json({ id: parentId })
})
