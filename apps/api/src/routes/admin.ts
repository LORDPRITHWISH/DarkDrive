import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"

export const adminRouter = Router()
adminRouter.use(requireAuth)
adminRouter.use((req, res, next) => {
  const u = currentUser(req)
  if (u.role !== "ADMIN") return res.status(403).json({ error: "forbidden" })
  next()
})

adminRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      storageQuotaBytes: true,
      upgradeRequestedAt: true,
      createdAt: true,
      avatarUrl: true,
    },
  })
  const usage = await prisma.file.groupBy({
    by: ["ownerId"],
    where: { isTrashed: false },
    _sum: { size: true },
  })
  const byOwner = new Map(usage.map((u) => [u.ownerId, u._sum.size ?? BigInt(0)]))
  res.json({
    users: users.map((u) => ({
      ...u,
      storageQuotaBytes: Number(u.storageQuotaBytes),
      usedBytes: Number(byOwner.get(u.id) ?? BigInt(0)),
    })),
  })
})

adminRouter.patch("/users/:id", async (req, res) => {
  const body = z
    .object({
      storageQuotaBytes: z.number().int().nonnegative().optional(),
      role: z.enum(["USER", "ADMIN"]).optional(),
      clearUpgradeRequest: z.boolean().optional(),
    })
    .parse(req.body)

  const data: Record<string, unknown> = {}
  if (body.storageQuotaBytes !== undefined)
    data.storageQuotaBytes = BigInt(body.storageQuotaBytes)
  if (body.role !== undefined) data.role = body.role
  if (body.clearUpgradeRequest) data.upgradeRequestedAt = null

  const u = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      storageQuotaBytes: true,
      upgradeRequestedAt: true,
    },
  })
  res.json({ ...u, storageQuotaBytes: Number(u.storageQuotaBytes) })
})
