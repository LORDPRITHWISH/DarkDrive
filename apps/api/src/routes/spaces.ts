import { Router } from "express"
import { z } from "zod"
import fs from "node:fs"
import path from "node:path"
import multer from "multer"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { notify } from "../lib/notify.js"
import {
  STORAGE_ROOT,
  absolutePath,
  ensureDirFor,
  newStorageKey,
  removeFile,
} from "../storage/local.js"

export const spacesRouter = Router()
spacesRouter.use(requireAuth)

// Logo uploads are small — 2 MB is plenty for an avatar / square logo.
const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const tmp = path.join(STORAGE_ROOT, ".tmp")
      fs.mkdirSync(tmp, { recursive: true })
      cb(null, tmp)
    },
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.originalname}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true)
    else cb(new Error("only_images_allowed"))
  },
})

// A space has one implicit "admin" — the creator (Space.ownerId). Everyone
// else is either a VIEWER (read-only) or an EDITOR (read + write). There is
// no separate ADMIN member role.
const MemberRole = z.enum(["VIEWER", "EDITOR"])

// Owners aren't stored in SpaceMember — they're identified by Space.ownerId.
// For the UI we synthesize a member row at response time so the list renders
// cleanly.
function projectMembers(
  space: {
    ownerId: string
    members: {
      userId: string
      role: string
      user: {
        name: string
        email: string
        avatarUrl: string | null
      }
    }[]
    owner?: { name: string; email: string; avatarUrl: string | null } | null
  }
) {
  const members = space.members
    .filter((m) => m.userId !== space.ownerId)
    .map((m) => ({
      userId: m.userId,
      // Any stale ADMIN rows are surfaced as EDITOR — the data model no
      // longer supports a separate admin role.
      role: m.role === "ADMIN" ? "EDITOR" : (m.role as "VIEWER" | "EDITOR"),
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
    }))
  if (space.owner) {
    members.unshift({
      userId: space.ownerId,
      role: "EDITOR",
      name: space.owner.name,
      email: space.owner.email,
      avatarUrl: space.owner.avatarUrl,
    })
  }
  return members
}

// The current viewer's own pin state for a space — Space.pinned for the
// owner (who has no SpaceMember row), otherwise their own membership's flag.
function viewerPinned(
  space: { ownerId: string; pinned: boolean; members: { userId: string; pinned: boolean }[] },
  userId: string
) {
  if (space.ownerId === userId) return space.pinned
  return space.members.find((m) => m.userId === userId)?.pinned ?? false
}

spacesRouter.get("/", async (req, res) => {
  const user = currentUser(req)
  const spaces = await prisma.space.findMany({
    where: {
      OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
    },
    include: {
      owner: true,
      members: { include: { user: true } },
    },
    orderBy: { createdAt: "desc" },
  })
  res.json({
    spaces: spaces.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      logoKey: s.logoKey,
      icon: s.icon,
      rootFolderId: s.rootFolderId,
      ownerId: s.ownerId,
      isPublic: s.isPublic,
      createdAt: s.createdAt,
      members: projectMembers(s),
      pinned: viewerPinned(s, user.id),
    })),
  })
})

// Discover public spaces the user isn't already in. Surfaced in the sidebar
// under a "Public" section so authenticated users can browse them.
spacesRouter.get("/public", async (req, res) => {
  const user = currentUser(req)
  const spaces = await prisma.space.findMany({
    where: {
      isPublic: true,
      ownerId: { not: user.id },
      members: { none: { userId: user.id } },
    },
    include: { owner: true },
    orderBy: { createdAt: "desc" },
  })
  res.json({
    spaces: spaces.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      logoKey: s.logoKey,
      icon: s.icon,
      rootFolderId: s.rootFolderId,
      ownerId: s.ownerId,
      isPublic: s.isPublic,
      createdAt: s.createdAt,
      ownerName: s.owner?.name ?? null,
    })),
  })
})

// Space "home" — everything needed to render the overview page: the space
// itself, its member roster, aggregate stats, and the most recently added
// content. Readable by owners, members, and (for public spaces) any
// authenticated user — same visibility rule the drive listing enforces.
spacesRouter.get("/:id/overview", async (req, res) => {
  const user = currentUser(req)
  const space = await prisma.space.findUnique({
    where: { id: req.params.id },
    include: { owner: true, members: { include: { user: true } } },
  })
  if (!space) return res.status(404).json({ error: "not_found" })
  const isOwner = space.ownerId === user.id
  const isMember = space.members.some((m) => m.userId === user.id)
  if (!isOwner && !isMember && !space.isPublic)
    return res.status(403).json({ error: "forbidden" })

  // Folders that belong to the space (root included — filtered out of the
  // count below). Used both for the folder count and to find shortcuts that
  // surface files into the space.
  const spaceFolders = await prisma.folder.findMany({
    where: { spaceId: space.id, isTrashed: false, isHidden: false },
    select: { id: true, updatedAt: true },
  })
  const folderIds = spaceFolders.map((f) => f.id)

  // Content in a space arrives two ways: files whose home is the space
  // (spaceId set, e.g. a folder moved in) and files surfaced via a shortcut
  // into one of the space's folders (the common case — see FileShortcut).
  // Union them, deduped by file id, so a file that is both counts once.
  const [directFiles, shortcuts] = await Promise.all([
    prisma.file.findMany({
      where: { spaceId: space.id, isTrashed: false, isHidden: false },
      orderBy: { createdAt: "desc" },
    }),
    folderIds.length
      ? prisma.fileShortcut.findMany({
          where: {
            folderId: { in: folderIds },
            file: { isTrashed: false, isHidden: false },
          },
          include: { file: true },
        })
      : Promise.resolve([]),
  ])

  const byId = new Map<string, { rec: (typeof directFiles)[number]; shortcutId?: string }>()
  for (const f of directFiles) byId.set(f.id, { rec: f })
  for (const s of shortcuts) {
    if (!byId.has(s.file.id)) byId.set(s.file.id, { rec: s.file, shortcutId: s.id })
  }

  const files = Array.from(byId.values()).map(({ rec, shortcutId }) => ({
    ...rec,
    size: Number(rec.size),
    ...(shortcutId ? { isShortcut: true as const, shortcutId } : {}),
  }))
  files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  const folderCount = folderIds.filter((id) => id !== space.rootFolderId).length

  // Last activity = the newest touch across the space's files and folders,
  // never earlier than the space's own creation.
  let lastActivityMs = space.createdAt.getTime()
  for (const f of files)
    lastActivityMs = Math.max(lastActivityMs, f.updatedAt.getTime(), f.createdAt.getTime())
  for (const f of spaceFolders)
    lastActivityMs = Math.max(lastActivityMs, f.updatedAt.getTime())

  const members = projectMembers(space)
  res.json({
    space: {
      id: space.id,
      name: space.name,
      color: space.color,
      logoKey: space.logoKey,
      icon: space.icon,
      rootFolderId: space.rootFolderId,
      ownerId: space.ownerId,
      isPublic: space.isPublic,
      createdAt: space.createdAt,
      members,
      pinned: viewerPinned(space, user.id),
    },
    stats: {
      fileCount: files.length,
      folderCount,
      totalBytes,
      memberCount: members.length,
      lastActivityAt: new Date(lastActivityMs).toISOString(),
    },
    recentFiles: files.slice(0, 12),
  })
})

// Upload (or replace) a space logo image. Returns a storage key the client
// can hand back via PATCH or POST to persist it on the space.
spacesRouter.post("/logo", logoUpload.single("logo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no_file" })
  const key = newStorageKey(req.file.originalname)
  const dest = ensureDirFor(key)
  fs.renameSync(req.file.path, dest)
  res.status(201).json({ logoKey: key })
})

// Serve a space logo. Public so it can render on share pages / public-space
// sidebars even before the viewer is a member.
spacesRouter.get("/:id/logo", async (req, res) => {
  const s = await prisma.space.findUnique({
    where: { id: req.params.id },
    select: { logoKey: true },
  })
  if (!s?.logoKey) return res.status(404).json({ error: "no_logo" })
  const abs = absolutePath(s.logoKey)
  if (!fs.existsSync(abs)) return res.status(410).json({ error: "gone" })
  // Logos rarely change (rewrites get a new key) — let the browser cache them.
  res.setHeader("Cache-Control", "public, max-age=86400")
  fs.createReadStream(abs).pipe(res)
})

// Owner-only: update space attributes.
spacesRouter.patch("/:id", async (req, res) => {
  const user = currentUser(req)
  const body = z
    .object({
      name: z.string().min(1).max(120).optional(),
      color: z.string().max(32).nullable().optional(),
      logoKey: z.string().max(255).nullable().optional(),
      icon: z.string().max(64).nullable().optional(),
      isPublic: z.boolean().optional(),
    })
    .parse(req.body)
  const space = await prisma.space.findUnique({ where: { id: req.params.id } })
  if (!space) return res.status(404).json({ error: "not_found" })
  if (space.ownerId !== user.id)
    return res.status(403).json({ error: "forbidden" })
  const updated = await prisma.space.update({
    where: { id: space.id },
    data: body,
  })
  // If the logo was replaced or cleared, best-effort delete the old blob so
  // storage doesn't accumulate orphans.
  if (
    body.logoKey !== undefined &&
    space.logoKey &&
    space.logoKey !== updated.logoKey
  ) {
    try {
      removeFile(space.logoKey)
    } catch {}
  }
  res.json(updated)
})

spacesRouter.post("/", async (req, res) => {
  const user = currentUser(req)
  const body = z
    .object({
      name: z.string().min(1).max(120),
      color: z.string().max(32).nullable().optional(),
      logoKey: z.string().max(255).nullable().optional(),
      icon: z.string().max(64).nullable().optional(),
    })
    .parse(req.body)
  const space = await prisma.$transaction(async (tx) => {
    const root = await tx.folder.create({ data: { name: body.name, ownerId: user.id } })
    const s = await tx.space.create({
      data: {
        name: body.name,
        color: body.color ?? null,
        logoKey: body.logoKey ?? null,
        icon: body.icon ?? null,
        ownerId: user.id,
        rootFolderId: root.id,
        // A space you just created should show up where you'd look for it —
        // in the sidebar — without an extra pin step.
        pinned: true,
      },
    })
    await tx.folder.update({ where: { id: root.id }, data: { spaceId: s.id } })
    return s
  })
  res.status(201).json(space)
})

// Self-service join for public spaces — anyone can already read a public
// space's contents, but joining creates a real membership so it shows up in
// the joiner's own space list and (once pinned) their sidebar.
spacesRouter.post("/:id/join", async (req, res) => {
  const user = currentUser(req)
  const space = await prisma.space.findUnique({ where: { id: req.params.id } })
  if (!space) return res.status(404).json({ error: "not_found" })
  if (!space.isPublic) return res.status(403).json({ error: "not_public" })
  if (space.ownerId === user.id)
    return res.status(400).json({ error: "already_owner" })
  const member = await prisma.spaceMember.upsert({
    where: { spaceId_userId: { spaceId: space.id, userId: user.id } },
    update: {},
    create: { spaceId: space.id, userId: user.id, role: "VIEWER" },
  })
  res.status(201).json(member)
})

// Self-service leave — removes the caller's own membership. Owners can't
// leave their own space (they'd delete it instead).
spacesRouter.post("/:id/leave", async (req, res) => {
  const user = currentUser(req)
  const space = await prisma.space.findUnique({ where: { id: req.params.id } })
  if (!space) return res.status(404).json({ error: "not_found" })
  if (space.ownerId === user.id)
    return res.status(400).json({ error: "owner_cannot_leave" })
  await prisma.spaceMember.deleteMany({
    where: { spaceId: space.id, userId: user.id },
  })
  res.json({ ok: true })
})

// Self-service sidebar pin toggle. Only pinned spaces show in the sidebar —
// for the owner that's Space.pinned (they have no SpaceMember row); for a
// joined member it's their own membership row.
spacesRouter.patch("/:id/pin", async (req, res) => {
  const user = currentUser(req)
  const { pinned } = z.object({ pinned: z.boolean() }).parse(req.body)
  const space = await prisma.space.findUnique({ where: { id: req.params.id } })
  if (!space) return res.status(404).json({ error: "not_found" })
  if (space.ownerId === user.id) {
    const updated = await prisma.space.update({
      where: { id: space.id },
      data: { pinned },
    })
    return res.json(updated)
  }
  const member = await prisma.spaceMember
    .update({
      where: { spaceId_userId: { spaceId: space.id, userId: user.id } },
      data: { pinned },
    })
    .catch(() => null)
  if (!member) return res.status(404).json({ error: "not_a_member" })
  res.json(member)
})

spacesRouter.post("/:id/members", async (req, res) => {
  const user = currentUser(req)
  const { email, role } = z
    .object({ email: z.string().email(), role: MemberRole.default("EDITOR") })
    .parse(req.body)
  const space = await prisma.space.findUnique({
    where: { id: req.params.id },
  })
  if (!space) return res.status(404).json({ error: "not_found" })
  if (space.ownerId !== user.id)
    return res.status(403).json({ error: "forbidden" })
  const target = await prisma.user.findUnique({ where: { email } })
  if (!target) return res.status(404).json({ error: "user_not_found" })
  if (target.id === space.ownerId)
    return res.status(400).json({ error: "cannot_invite_owner" })
  const existing = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: space.id, userId: target.id } },
  })
  const member = await prisma.spaceMember.upsert({
    where: { spaceId_userId: { spaceId: space.id, userId: target.id } },
    update: { role },
    create: { spaceId: space.id, userId: target.id, role },
  })
  if (!existing) {
    void notify(target.id, {
      type: "space_invite",
      title: `${user.name} added you to "${space.name}"`,
      body: `Role: ${role}`,
      link: `/drive/${space.rootFolderId}`,
    })
  } else if (existing.role !== role) {
    void notify(target.id, {
      type: "space_role_changed",
      title: `Your role in "${space.name}" changed to ${role}`,
      link: `/drive/${space.rootFolderId}`,
    })
  }
  res.status(201).json(member)
})

spacesRouter.patch("/:id/members/:userId", async (req, res) => {
  const user = currentUser(req)
  const { role } = z.object({ role: MemberRole }).parse(req.body)
  const space = await prisma.space.findUnique({
    where: { id: req.params.id },
  })
  if (!space) return res.status(404).json({ error: "not_found" })
  if (space.ownerId !== user.id)
    return res.status(403).json({ error: "forbidden" })
  if (req.params.userId === space.ownerId)
    return res.status(400).json({ error: "cannot_modify_owner" })
  const m = await prisma.spaceMember.update({
    where: { spaceId_userId: { spaceId: space.id, userId: req.params.userId } },
    data: { role },
  })
  void notify(req.params.userId, {
    type: "space_role_changed",
    title: `Your role in "${space.name}" changed to ${role}`,
    link: `/drive/${space.rootFolderId}`,
  })
  res.json(m)
})

spacesRouter.delete("/:id/members/:userId", async (req, res) => {
  const user = currentUser(req)
  const space = await prisma.space.findUnique({
    where: { id: req.params.id },
  })
  if (!space) return res.status(404).json({ error: "not_found" })
  if (space.ownerId !== user.id)
    return res.status(403).json({ error: "forbidden" })
  if (req.params.userId === space.ownerId)
    return res.status(400).json({ error: "cannot_remove_owner" })
  await prisma.spaceMember.delete({
    where: { spaceId_userId: { spaceId: space.id, userId: req.params.userId } },
  })
  void notify(req.params.userId, {
    type: "space_removed",
    title: `You were removed from "${space.name}"`,
  })
  res.json({ ok: true })
})

spacesRouter.delete("/:id", async (req, res) => {
  const user = currentUser(req)
  const space = await prisma.space.findUnique({ where: { id: req.params.id } })
  if (!space) return res.status(404).json({ error: "not_found" })
  if (space.ownerId !== user.id) return res.status(403).json({ error: "forbidden" })
  await prisma.space.delete({ where: { id: space.id } })
  res.json({ ok: true })
})
