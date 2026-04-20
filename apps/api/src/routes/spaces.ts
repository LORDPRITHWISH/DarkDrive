import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"

export const spacesRouter = Router()
spacesRouter.use(requireAuth)

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
      rootFolderId: s.rootFolderId,
      ownerId: s.ownerId,
      isPublic: s.isPublic,
      createdAt: s.createdAt,
      ownerName: s.owner?.name ?? null,
    })),
  })
})

// Owner-only: update space attributes (currently just name + public toggle).
spacesRouter.patch("/:id", async (req, res) => {
  const user = currentUser(req)
  const body = z
    .object({
      name: z.string().min(1).max(120).optional(),
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
  res.json(updated)
})

spacesRouter.post("/", async (req, res) => {
  const user = currentUser(req)
  const { name } = z.object({ name: z.string().min(1).max(120) }).parse(req.body)
  const space = await prisma.$transaction(async (tx) => {
    const root = await tx.folder.create({ data: { name, ownerId: user.id } })
    const s = await tx.space.create({
      data: { name, ownerId: user.id, rootFolderId: root.id },
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
