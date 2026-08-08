import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"

declare module "express-session" {
  interface SessionData {
    nav?: { stack: string[]; index: number }
  }
}

export const meRouter = Router()
meRouter.use(requireAuth)

async function usedBytes(userId: string): Promise<bigint> {
  const r = await prisma.file.aggregate({
    _sum: { size: true },
    where: { ownerId: userId, isTrashed: false },
  })
  return r._sum.size ?? BigInt(0)
}

meRouter.get("/quota", async (req, res) => {
  const user = currentUser(req)
  const used = await usedBytes(user.id)
  res.json({
    used: Number(used),
    total: Number(user.storageQuotaBytes),
    role: user.role,
    upgradeRequestedAt: user.upgradeRequestedAt,
    upgradeRequestedBytes: user.upgradeRequestedBytes
      ? Number(user.upgradeRequestedBytes)
      : null,
  })
})

meRouter.post("/request-upgrade", async (req, res) => {
  const user = currentUser(req)
  const { bytes } = z
    .object({
      bytes: z
        .number()
        .int()
        .positive()
        .max(10 * 1024 ** 4), // 10 TiB cap
    })
    .parse(req.body)
  if (BigInt(bytes) <= user.storageQuotaBytes)
    return res.status(400).json({ error: "must_exceed_current_quota" })
  await prisma.user.update({
    where: { id: user.id },
    data: {
      upgradeRequestedAt: new Date(),
      upgradeRequestedBytes: BigInt(bytes),
    },
  })
  res.json({ ok: true })
})

// Directory search used by the invite autocomplete. Casts a wider net than a
// strict `contains` so the client's fuzzy matcher has something to work with
// on typos (e.g. "jhon" still surfaces users whose name starts with "jh").
// Requires at least 2 chars so we don't hand out the entire user directory.
meRouter.get("/user-search", async (req, res) => {
  const user = currentUser(req)
  const q = String(req.query.q ?? "").trim()
  const limit = Math.min(
    parseInt(String(req.query.limit ?? "30"), 10) || 30,
    50
  )
  if (q.length < 2) return res.json({ users: [] })
  const head = q.slice(0, 2)
  const users = await prisma.user.findMany({
    where: {
      id: { not: user.id },
      disabledAt: null,
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { email: { startsWith: head, mode: "insensitive" } },
        { name: { startsWith: head, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, email: true, avatarUrl: true },
    take: limit,
    orderBy: { name: "asc" },
  })
  res.json({ users })
})

// Distinct users the current user has shared a space with (either spaces
// they own or spaces they're a member of). Used as the default suggestion
// set when the invite input is empty.
meRouter.get("/contacts", async (req, res) => {
  const user = currentUser(req)
  const rows = await prisma.spaceMember.findMany({
    where: {
      userId: { not: user.id },
      space: {
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
    },
    include: { user: true },
  })
  // Also include space owners of spaces I'm a member of (they're on
  // Space.ownerId, not necessarily in SpaceMember rows).
  const ownedBy = await prisma.space.findMany({
    where: {
      ownerId: { not: user.id },
      members: { some: { userId: user.id } },
    },
    include: { owner: true },
  })

  const byId = new Map<
    string,
    { id: string; name: string; email: string; avatarUrl: string | null }
  >()
  for (const m of rows) {
    byId.set(m.userId, {
      id: m.userId,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
    })
  }
  for (const s of ownedBy) {
    if (s.owner)
      byId.set(s.owner.id, {
        id: s.owner.id,
        name: s.owner.name,
        email: s.owner.email,
        avatarUrl: s.owner.avatarUrl,
      })
  }
  res.json({ contacts: Array.from(byId.values()) })
})

meRouter.get("/starred", async (req, res) => {
  const user = currentUser(req)
  const spaceIds = (
    await prisma.spaceMember.findMany({
      where: { userId: user.id },
      select: { spaceId: true },
    })
  ).map((m) => m.spaceId)
  const [folders, files] = await Promise.all([
    prisma.folder.findMany({
      where: {
        isStarred: true,
        isTrashed: false,
        isHidden: false,
        OR: [{ ownerId: user.id }, { spaceId: { in: spaceIds } }],
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.file.findMany({
      where: {
        isStarred: true,
        isTrashed: false,
        isHidden: false,
        OR: [{ ownerId: user.id }, { spaceId: { in: spaceIds } }],
      },
      orderBy: { updatedAt: "desc" },
    }),
  ])
  res.json({
    folders,
    files: files.map((f) => ({ ...f, size: Number(f.size) })),
  })
})

meRouter.get("/trash", async (req, res) => {
  const user = currentUser(req)
  // `deletedAt: null` excludes items the user has already permanently deleted —
  // those live on in the admin recycle bin and must not reappear in the user's
  // own bin.
  const [folders, files] = await Promise.all([
    prisma.folder.findMany({
      where: { ownerId: user.id, isTrashed: true, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.file.findMany({
      where: { ownerId: user.id, isTrashed: true, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    }),
  ])
  res.json({
    folders,
    files: files.map((f) => ({ ...f, size: Number(f.size) })),
  })
})

// Empty the user's bin. From the user's point of view this permanently deletes
// everything in the bin (files marked isTrashed plus all descendants of trashed
// folders). Nothing is actually destroyed, though — every affected file and
// folder is soft-deleted into the admin-only recycle bin (stamped deletedAt) so
// an admin can still restore or purge it. Storage blobs are retained.
meRouter.post("/trash/empty", async (req, res) => {
  const user = currentUser(req)
  const [trashedFiles, trashedFolders] = await Promise.all([
    prisma.file.findMany({
      where: { ownerId: user.id, isTrashed: true, deletedAt: null },
      select: { id: true },
    }),
    prisma.folder.findMany({
      where: { ownerId: user.id, isTrashed: true, deletedAt: null },
      select: { id: true },
    }),
  ])

  // Walk the trashed-folder subtree so every descendant folder (and its files)
  // is stamped too — the DB has no cascade for a non-destructive update.
  const folderIds = new Set<string>(trashedFolders.map((f) => f.id))
  let frontier = trashedFolders.map((f) => f.id)
  while (frontier.length > 0) {
    const children = await prisma.folder.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    })
    const next = children.map((c) => c.id).filter((id) => !folderIds.has(id))
    next.forEach((id) => folderIds.add(id))
    frontier = next
  }

  const now = new Date()
  const data = { deletedAt: now, deletedById: user.id, isTrashed: true }
  const allFolderIds = [...folderIds]
  const [directFiles, descendantFiles] = await prisma.$transaction([
    // Files sitting directly in the bin.
    prisma.file.updateMany({
      where: { id: { in: trashedFiles.map((f) => f.id) } },
      data,
    }),
    // Files anywhere inside a trashed folder subtree.
    prisma.file.updateMany({
      where: { folderId: { in: allFolderIds }, deletedAt: null },
      data,
    }),
    prisma.folder.updateMany({
      where: { id: { in: allFolderIds }, deletedAt: null },
      data,
    }),
  ])

  res.json({
    ok: true,
    files: directFiles.count + descendantFiles.count,
    folders: allFolderIds.length,
  })
})

meRouter.get("/recent", async (req, res) => {
  const user = currentUser(req)
  const limit = Math.min(parseInt(String(req.query.limit ?? "24"), 10) || 24, 100)
  const rows = await prisma.fileAccess.findMany({
    where: { userId: user.id },
    orderBy: { accessedAt: "desc" },
    distinct: ["fileId"],
    take: limit,
    include: { file: true },
  })
  const files = rows
    .filter((r) => r.file && !r.file.isTrashed)
    .map((r) => ({
      ...r.file,
      size: Number(r.file.size),
      accessedAt: r.accessedAt,
      action: r.action,
    }))
  res.json({ files })
})

// Files the user can see that were added in the last 30 days and that they
// haven't viewed or downloaded yet. Opening the file (inline preview or
// download) writes a FileAccess row, which drops the file from this list.
meRouter.get("/recently-added", async (req, res) => {
  const user = currentUser(req)
  const limit = Math.min(parseInt(String(req.query.limit ?? "12"), 10) || 12, 50)
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)
  const spaceIds = (
    await prisma.spaceMember.findMany({
      where: { userId: user.id },
      select: { spaceId: true },
    })
  ).map((m) => m.spaceId)

  const files = await prisma.file.findMany({
    where: {
      isTrashed: false,
      isHidden: false,
      createdAt: { gte: since },
      OR: [{ ownerId: user.id }, { spaceId: { in: spaceIds } }],
      accesses: { none: { userId: user.id } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  res.json({ files: files.map((f) => ({ ...f, size: Number(f.size) })) })
})

// Every file owned by the user, newest first — a straightforward history of
// what they've uploaded, paged by cursor since it only grows over time.
meRouter.get("/uploads", async (req, res) => {
  const user = currentUser(req)
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200)
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined
  const files = await prisma.file.findMany({
    where: { ownerId: user.id, isTrashed: false },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  })
  res.json({
    files: files.map((f) => ({ ...f, size: Number(f.size) })),
    nextCursor: files.length === limit ? files[files.length - 1].id : null,
  })
})

meRouter.get("/folder-suggestions", async (req, res) => {
  const user = currentUser(req)
  const limit = Math.min(parseInt(String(req.query.limit ?? "8"), 10) || 8, 30)
  // Starred first, then recently touched folders owned by the user or in their spaces.
  const spaceIds = (
    await prisma.spaceMember.findMany({
      where: { userId: user.id },
      select: { spaceId: true },
    })
  ).map((m) => m.spaceId)
  const folders = await prisma.folder.findMany({
    where: {
      isTrashed: false,
      isHidden: false,
      parentId: { not: null }, // exclude root folders
      OR: [{ ownerId: user.id }, { spaceId: { in: spaceIds } }],
    },
    orderBy: [{ isStarred: "desc" }, { updatedAt: "desc" }],
    take: limit,
  })
  res.json({ folders })
})

meRouter.get("/suggestions", async (req, res) => {
  const user = currentUser(req)
  const limit = Math.min(parseInt(String(req.query.limit ?? "12"), 10) || 12, 50)
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)
  const grouped = await prisma.fileAccess.groupBy({
    by: ["fileId"],
    where: { userId: user.id, accessedAt: { gte: since } },
    _count: { _all: true },
    _max: { accessedAt: true },
    orderBy: [{ _count: { fileId: "desc" } }, { _max: { accessedAt: "desc" } }],
    take: limit * 2,
  })
  if (grouped.length === 0) return res.json({ files: [] })

  const now = Date.now()
  // combine frequency + recency: weight = count / days_since^0.5
  const scored = grouped
    .map((g) => {
      const ageH = Math.max(1, (now - (g._max.accessedAt?.getTime() ?? now)) / 3600000)
      return { fileId: g.fileId, score: g._count._all / Math.sqrt(ageH) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  const files = await prisma.file.findMany({
    where: { id: { in: scored.map((s) => s.fileId) }, isTrashed: false },
  })
  const byId = new Map(files.map((f) => [f.id, f]))
  const ordered = scored
    .map((s) => byId.get(s.fileId))
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({ ...f, size: Number(f.size) }))

  res.json({ files: ordered })
})

meRouter.post("/access", async (req, res) => {
  const user = currentUser(req)
  const body = z
    .object({ fileId: z.string(), action: z.enum(["view", "download"]).default("view") })
    .parse(req.body)
  // ensure file exists; access control is handled elsewhere on the actual fetch
  const file = await prisma.file.findUnique({ where: { id: body.fileId } })
  if (!file) return res.status(404).json({ error: "not_found" })
  await prisma.fileAccess.create({
    data: { userId: user.id, fileId: body.fileId, action: body.action },
  })
  res.json({ ok: true })
})

// --- Session-backed navigation stack -----------------------------------------

function getNav(req: any) {
  if (!req.session.nav) req.session.nav = { stack: [], index: -1 }
  return req.session.nav as { stack: string[]; index: number }
}

function navState(nav: { stack: string[]; index: number }) {
  return {
    current: nav.stack[nav.index] ?? null,
    canBack: nav.index > 0,
    canForward: nav.index >= 0 && nav.index < nav.stack.length - 1,
    length: nav.stack.length,
    index: nav.index,
  }
}

meRouter.get("/nav", (req, res) => {
  res.json(navState(getNav(req)))
})

meRouter.post("/nav/push", (req, res) => {
  const body = z.object({ path: z.string().min(1).max(512) }).parse(req.body)
  const nav = getNav(req)
  if (nav.stack[nav.index] === body.path) {
    return res.json(navState(nav))
  }
  nav.stack = nav.stack.slice(0, nav.index + 1)
  nav.stack.push(body.path)
  if (nav.stack.length > 100) nav.stack.splice(0, nav.stack.length - 100)
  nav.index = nav.stack.length - 1
  req.session.save(() => res.json(navState(nav)))
})

meRouter.post("/nav/back", (req, res) => {
  const nav = getNav(req)
  if (nav.index > 0) nav.index -= 1
  req.session.save(() => res.json(navState(nav)))
})

meRouter.post("/nav/forward", (req, res) => {
  const nav = getNav(req)
  if (nav.index < nav.stack.length - 1) nav.index += 1
  req.session.save(() => res.json(navState(nav)))
})
