import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"

export const spacesRouter = Router()
spacesRouter.use(requireAuth)

spacesRouter.get("/", async (req, res) => {
  const user = currentUser(req)
  const spaces = await prisma.space.findMany({
    where: {
      OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
    },
    include: { members: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  })
  res.json({
    spaces: spaces.map((s) => ({
      id: s.id,
      name: s.name,
      rootFolderId: s.rootFolderId,
      ownerId: s.ownerId,
      createdAt: s.createdAt,
      members: s.members.map((m) => ({
        userId: m.userId,
        role: m.role,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
      })),
    })),
  })
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
    await tx.spaceMember.create({
      data: { spaceId: s.id, userId: user.id, role: "ADMIN" },
    })
    return s
  })
  res.status(201).json(space)
})

spacesRouter.post("/:id/members", async (req, res) => {
  const user = currentUser(req)
  const { email, role } = z
    .object({ email: z.string().email(), role: z.enum(["VIEWER", "EDITOR", "ADMIN"]).default("EDITOR") })
    .parse(req.body)
  const space = await prisma.space.findUnique({
    where: { id: req.params.id },
    include: { members: true },
  })
  if (!space) return res.status(404).json({ error: "not_found" })
  const me = space.members.find((m) => m.userId === user.id)
  if (!me || me.role !== "ADMIN") return res.status(403).json({ error: "forbidden" })
  const target = await prisma.user.findUnique({ where: { email } })
  if (!target) return res.status(404).json({ error: "user_not_found" })
  const member = await prisma.spaceMember.upsert({
    where: { spaceId_userId: { spaceId: space.id, userId: target.id } },
    update: { role },
    create: { spaceId: space.id, userId: target.id, role },
  })
  res.status(201).json(member)
})

spacesRouter.patch("/:id/members/:userId", async (req, res) => {
  const user = currentUser(req)
  const { role } = z
    .object({ role: z.enum(["VIEWER", "EDITOR", "ADMIN"]) })
    .parse(req.body)
  const space = await prisma.space.findUnique({
    where: { id: req.params.id },
    include: { members: true },
  })
  if (!space) return res.status(404).json({ error: "not_found" })
  const me = space.members.find((m) => m.userId === user.id)
  if (!me || me.role !== "ADMIN") return res.status(403).json({ error: "forbidden" })
  if (req.params.userId === space.ownerId && role !== "ADMIN")
    return res.status(400).json({ error: "cannot_demote_owner" })
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
    include: { members: true },
  })
  if (!space) return res.status(404).json({ error: "not_found" })
  const me = space.members.find((m) => m.userId === user.id)
  if (!me || me.role !== "ADMIN") return res.status(403).json({ error: "forbidden" })
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
