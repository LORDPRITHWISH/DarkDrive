import { Router } from "express"
import { z } from "zod"
import fs from "node:fs"
import path from "node:path"
import multer from "multer"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
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
      },
    })
    await tx.folder.update({ where: { id: root.id }, data: { spaceId: s.id } })
    return s
  })
  res.status(201).json(space)
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
  const member = await prisma.spaceMember.upsert({
    where: { spaceId_userId: { spaceId: space.id, userId: target.id } },
    update: { role },
    create: { spaceId: space.id, userId: target.id, role },
  })
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
