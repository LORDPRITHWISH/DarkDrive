import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { assertUserRootFolderId } from "../lib/access.js"

export const syncRouter = Router()
syncRouter.use(requireAuth)

// Guard against a parent cycle wedging the path walk. Nothing should create
// one (folders.ts rejects moves into a descendant), but an unbounded while
// loop on user-shaped data is not worth the risk.
const MAX_DEPTH = 64

type FolderRow = { id: string; name: string; parentId: string | null }

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

// Everything in the user's own drive that changed since `since`, as paths.
// Deletes are included (isTrashed/deletedAt) so clients know to remove the
// local copy — no separate change journal is needed because every mutation
// already bumps updatedAt.
//
// A rename or move of a folder does NOT bump its descendants' updatedAt, so
// clients must handle a changed folder path by moving the local directory;
// the children then follow on disk for free.
syncRouter.get("/changes", async (req, res) => {
  const user = currentUser(req)
  const since = new Date(String(req.query.since ?? 0))
  if (Number.isNaN(since.getTime())) return res.status(400).json({ error: "bad_since" })

  // Captured before the reads: a row written mid-query is then re-delivered
  // next poll rather than missed. Applying a change twice is a no-op.
  const cursor = new Date()
  const rootId = await assertUserRootFolderId(user)

  // Every folder, not just changed ones — needed to resolve parent chains.
  const folders = await prisma.folder.findMany({
    where: { ownerId: user.id, spaceId: null },
    select: { id: true, name: true, parentId: true, isTrashed: true, deletedAt: true, updatedAt: true },
  })
  const byId = new Map(folders.map((f) => [f.id, f]))
  const pathOf = pathBuilder(byId, rootId)

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

// Resolve a path to a folder id, creating any missing segments. Sync clients
// work in paths; every other write endpoint works in folder ids.
syncRouter.post("/folder", async (req, res) => {
  const user = currentUser(req)
  const { path } = z.object({ path: z.string().max(4096) }).parse(req.body)
  const rootId = await assertUserRootFolderId(user)

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
