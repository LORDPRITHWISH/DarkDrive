import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { getFolderWithAccess, assertUserRootFolderId } from "../lib/access.js"

export const foldersRouter = Router()
foldersRouter.use(requireAuth)

// List contents of a folder (subfolders + files)
foldersRouter.get("/:id/contents", async (req, res) => {
  const user = currentUser(req)
  const id = req.params.id === "root" ? await assertUserRootFolderId(user) : req.params.id
  const folder = await getFolderWithAccess(user.id, id, "read")
  if (!folder) return res.status(404).json({ error: "not_found" })

  const includeHidden = req.query.includeHidden === "1"
  const includeTrashed = req.query.includeTrashed === "1"

  const [folders, realFiles, shortcuts, path] = await Promise.all([
    prisma.folder.findMany({
      where: {
        parentId: folder.id,
        ...(includeTrashed ? {} : { isTrashed: false }),
        ...(includeHidden ? {} : { isHidden: false }),
      },
      orderBy: { name: "asc" },
    }),
    prisma.file.findMany({
      where: {
        folderId: folder.id,
        ...(includeTrashed ? {} : { isTrashed: false }),
        ...(includeHidden ? {} : { isHidden: false }),
      },
      orderBy: { name: "asc" },
    }),
    prisma.fileShortcut.findMany({
      where: {
        folderId: folder.id,
        file: {
          ...(includeTrashed ? {} : { isTrashed: false }),
          ...(includeHidden ? {} : { isHidden: false }),
        },
      },
      include: { file: true },
    }),
    breadcrumbs(folder.id),
  ])

  const files = [
    ...realFiles.map((f) => ({ ...f, size: Number(f.size) })),
    ...shortcuts.map((s) => ({
      ...s.file,
      size: Number(s.file.size),
      shortcutId: s.id,
      isShortcut: true as const,
    })),
  ]

  res.json({ folder, folders, files, breadcrumbs: path })
})

async function breadcrumbs(folderId: string) {
  const crumbs: { id: string; name: string }[] = []
  let cur: { id: string; name: string; parentId: string | null } | null =
    await prisma.folder.findUnique({
      where: { id: folderId },
      select: { id: true, name: true, parentId: true },
    })
  while (cur) {
    crumbs.unshift({ id: cur.id, name: cur.name })
    if (!cur.parentId) break
    cur = await prisma.folder.findUnique({
      where: { id: cur.parentId },
      select: { id: true, name: true, parentId: true },
    })
  }
  return crumbs
}

// Create folder
foldersRouter.post("/", async (req, res) => {
  const user = currentUser(req)
  const body = z
    .object({
      name: z.string().min(1).max(255),
      parentId: z.string(),
      color: z.string().max(32).nullable().optional(),
    })
    .parse(req.body)
  const parent = await getFolderWithAccess(user.id, body.parentId, "write")
  if (!parent) return res.status(403).json({ error: "forbidden" })
  const f = await prisma.folder.create({
    data: {
      name: body.name,
      color: body.color ?? null,
      parentId: parent.id,
      ownerId: parent.ownerId,
      spaceId: parent.spaceId,
    },
  })
  res.status(201).json(f)
})

// Rename / update flags
foldersRouter.patch("/:id", async (req, res) => {
  const user = currentUser(req)
  const body = z
    .object({
      name: z.string().min(1).max(255).optional(),
      color: z.string().max(32).nullable().optional(),
      isHidden: z.boolean().optional(),
      isStarred: z.boolean().optional(),
      isTrashed: z.boolean().optional(),
      parentId: z.string().optional(),
    })
    .parse(req.body)
  const folder = await getFolderWithAccess(user.id, req.params.id, "write")
  if (!folder) return res.status(403).json({ error: "forbidden" })

  if (body.parentId) {
    const target = await getFolderWithAccess(user.id, body.parentId, "write")
    if (!target) return res.status(403).json({ error: "forbidden_target" })
    if (await isDescendant(folder.id, target.id))
      return res.status(400).json({ error: "cycle" })
    // Cascade spaceId to the moved subtree so membership follows the hierarchy.
    if ((target.spaceId ?? null) !== (folder.spaceId ?? null)) {
      await cascadeSpaceId(folder.id, target.spaceId ?? null)
    }
  }

  const updated = await prisma.folder.update({ where: { id: folder.id }, data: body })
  res.json(updated)
})

// Mirror a folder tree into a target folder, creating shortcuts for every
// file found along the way. Used by "Add to space" for folders: the source
// tree stays in the uploader's drive; a parallel folder structure with
// file-shortcuts appears in the target (typically a shared space).
foldersRouter.post("/:id/mirror", async (req, res) => {
  const user = currentUser(req)
  const { targetFolderId } = z
    .object({ targetFolderId: z.string() })
    .parse(req.body)
  const source = await getFolderWithAccess(user.id, req.params.id, "read")
  if (!source) return res.status(404).json({ error: "not_found" })
  const target = await getFolderWithAccess(user.id, targetFolderId, "write")
  if (!target) return res.status(403).json({ error: "forbidden_target" })
  // Block the obvious cycle: can't mirror a folder into itself or a descendant.
  if (source.id === target.id || (await isDescendant(source.id, target.id)))
    return res.status(400).json({ error: "cycle" })

  const targetSpaceId = target.spaceId

  async function walk(sourceId: string, destId: string) {
    const [files, subFolders] = await Promise.all([
      prisma.file.findMany({
        where: { folderId: sourceId, isTrashed: false, isHidden: false },
        select: { id: true },
      }),
      prisma.folder.findMany({
        where: { parentId: sourceId, isTrashed: false, isHidden: false },
      }),
    ])
    for (const f of files) {
      await prisma.fileShortcut.upsert({
        where: { fileId_folderId: { fileId: f.id, folderId: destId } },
        update: {},
        create: { fileId: f.id, folderId: destId },
      })
    }
    for (const sub of subFolders) {
      const mirror = await prisma.folder.create({
        data: {
          name: sub.name,
          color: sub.color,
          parentId: destId,
          ownerId: user.id,
          spaceId: targetSpaceId,
        },
      })
      await walk(sub.id, mirror.id)
    }
  }
  await walk(source.id, target.id)
  res.status(201).json({ ok: true })
})

async function cascadeSpaceId(rootFolderId: string, spaceId: string | null) {
  const ids = new Set<string>([rootFolderId])
  let frontier = [rootFolderId]
  while (frontier.length) {
    const kids = await prisma.folder.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    })
    frontier = []
    for (const k of kids) {
      if (!ids.has(k.id)) {
        ids.add(k.id)
        frontier.push(k.id)
      }
    }
  }
  const all = Array.from(ids)
  await prisma.$transaction([
    prisma.folder.updateMany({ where: { id: { in: all } }, data: { spaceId } }),
    prisma.file.updateMany({ where: { folderId: { in: all } }, data: { spaceId } }),
  ])
}

async function isDescendant(rootId: string, candidateId: string): Promise<boolean> {
  // true if candidateId is a descendant of rootId
  let cur: string | null = candidateId
  while (cur) {
    if (cur === rootId) return true
    const p: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: cur },
      select: { parentId: true },
    })
    cur = p?.parentId ?? null
  }
  return false
}

// Delete (hard)
foldersRouter.delete("/:id", async (req, res) => {
  const user = currentUser(req)
  const folder = await getFolderWithAccess(user.id, req.params.id, "admin")
  if (!folder) return res.status(403).json({ error: "forbidden" })
  if (!folder.parentId) return res.status(400).json({ error: "cannot_delete_root" })
  await prisma.folder.delete({ where: { id: folder.id } })
  res.json({ ok: true })
})

// Tree (user's own drive + spaces they're in) for sidebar
foldersRouter.get("/tree/me", async (req, res) => {
  const user = currentUser(req)
  const rootId = await assertUserRootFolderId(user)
  const mine = await prisma.folder.findMany({
    where: { ownerId: user.id, spaceId: null, isTrashed: false },
    select: { id: true, name: true, parentId: true },
  })
  res.json({ rootId, folders: mine })
})
