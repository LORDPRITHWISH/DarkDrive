import { Router } from "express"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

notificationsRouter.get("/", async (req, res) => {
  const user = currentUser(req)
  const limit = Math.min(
    parseInt(String(req.query.limit ?? "50"), 10) || 50,
    100
  )
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ])
  res.json({ notifications, unreadCount })
})

notificationsRouter.post("/:id/read", async (req, res) => {
  const user = currentUser(req)
  const n = await prisma.notification.findUnique({ where: { id: req.params.id } })
  if (!n || n.userId !== user.id) return res.status(404).json({ error: "not_found" })
  const updated = await prisma.notification.update({
    where: { id: n.id },
    data: { readAt: n.readAt ?? new Date() },
  })
  res.json(updated)
})

notificationsRouter.post("/read-all", async (req, res) => {
  const user = currentUser(req)
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  })
  res.json({ ok: true })
})

notificationsRouter.delete("/:id", async (req, res) => {
  const user = currentUser(req)
  const n = await prisma.notification.findUnique({ where: { id: req.params.id } })
  if (!n || n.userId !== user.id) return res.status(404).json({ error: "not_found" })
  await prisma.notification.delete({ where: { id: n.id } })
  res.json({ ok: true })
})
