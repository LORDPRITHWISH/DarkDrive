import { Router } from "express"
import { z } from "zod"
import os from "node:os"
import fsp from "node:fs/promises"
import { prisma } from "../db/prisma.js"
import { redis } from "../db/redis.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { STORAGE_ROOT } from "../storage/local.js"

export const adminRouter = Router()
adminRouter.use(requireAuth)
adminRouter.use((req, res, next) => {
  const u = currentUser(req)
  if (u.role !== "ADMIN") return res.status(403).json({ error: "forbidden" })
  next()
})

// Live server / OS / process metrics — cheap, read on each request.
adminRouter.get("/server-stats", async (_req, res) => {
  const snapshotStart = cpuSnapshot()
  await new Promise((r) => setTimeout(r, 200))
  const snapshotEnd = cpuSnapshot()
  const idleDelta = snapshotEnd.idle - snapshotStart.idle
  const totalDelta = snapshotEnd.total - snapshotStart.total
  const cpuUsagePct =
    totalDelta > 0
      ? Math.max(0, Math.min(100, 100 * (1 - idleDelta / totalDelta)))
      : 0

  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem

  let disk:
    | { total: number; free: number; used: number; pct: number }
    | null = null
  try {
    const s = await fsp.statfs(STORAGE_ROOT)
    const total = Number(s.bsize) * Number(s.blocks)
    const free = Number(s.bsize) * Number(s.bavail)
    const used = total - free
    disk = { total, free, used, pct: total > 0 ? (used / total) * 100 : 0 }
  } catch {
    // statfs unsupported — leave as null
  }

  let redisInfo: Record<string, string> | null = null
  try {
    const r = (await redis.info("stats")) as string
    redisInfo = Object.fromEntries(
      r
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => {
          const [k, ...rest] = l.split(":")
          return [k, rest.join(":")]
        })
    )
  } catch {
    // ignore
  }

  const procMem = process.memoryUsage()
  const [load1, load5, load15] = os.loadavg()
  const cpus = os.cpus()

  res.json({
    host: {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      release: os.release(),
      node: process.version,
      uptimeSec: Math.floor(os.uptime()),
    },
    process: {
      pid: process.pid,
      uptimeSec: Math.floor(process.uptime()),
      rss: procMem.rss,
      heapTotal: procMem.heapTotal,
      heapUsed: procMem.heapUsed,
      external: procMem.external,
    },
    cpu: {
      model: cpus[0]?.model ?? "unknown",
      cores: cpus.length,
      speedMHz: cpus[0]?.speed ?? 0,
      usagePct: cpuUsagePct,
      load1,
      load5,
      load15,
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      pct: totalMem > 0 ? (usedMem / totalMem) * 100 : 0,
    },
    disk,
    redis: redisInfo
      ? {
          hits: Number(redisInfo.keyspace_hits ?? 0),
          misses: Number(redisInfo.keyspace_misses ?? 0),
          evictedKeys: Number(redisInfo.evicted_keys ?? 0),
          totalConnections: Number(redisInfo.total_connections_received ?? 0),
        }
      : null,
  })
})

function cpuSnapshot() {
  const cpus = os.cpus()
  let idle = 0
  let total = 0
  for (const cpu of cpus) {
    for (const v of Object.values(cpu.times)) total += v
    idle += cpu.times.idle
  }
  return { idle, total }
}

// Comprehensive dashboard stats. All aggregated from existing tables in a
// single endpoint — the panel is read-mostly so this is fine for now; swap in
// cached snapshots when the dataset grows.
adminRouter.get("/stats", async (_req, res) => {
  const now = new Date()
  const dayMs = 86400000
  const d7 = new Date(now.getTime() - 7 * dayMs)
  const d30 = new Date(now.getTime() - 30 * dayMs)
  const monthsBack = 12
  const monthStart = new Date(
    now.getFullYear(),
    now.getMonth() - (monthsBack - 1),
    1
  )

  const [
    userCount,
    disabledCount,
    adminCount,
    recentSignupsWindow,
    allSignups,
    filesAgg,
    trashedAgg,
    allFilesForTypes,
    largestFiles,
    quotaAgg,
    usageByOwner,
    accessCount7d,
    accessCount30d,
    accessHourly,
    recentAccesses,
    recentLogins,
    shortcutCount,
    sharedFilesCount,
    shareLinksCount,
    spaceCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { disabledAt: { not: null } } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { createdAt: { gte: d30 } } }),
    prisma.user.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { createdAt: true },
    }),
    prisma.file.aggregate({
      _count: { _all: true },
      _sum: { size: true },
      where: { isTrashed: false },
    }),
    prisma.file.aggregate({
      _count: { _all: true },
      _sum: { size: true },
      where: { isTrashed: true },
    }),
    prisma.file.findMany({
      where: { isTrashed: false },
      select: { mimeType: true, size: true, name: true },
    }),
    prisma.file.findMany({
      where: { isTrashed: false },
      orderBy: { size: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        size: true,
        mimeType: true,
        ownerId: true,
        createdAt: true,
      },
    }),
    prisma.user.aggregate({ _sum: { storageQuotaBytes: true } }),
    prisma.file.groupBy({
      by: ["ownerId"],
      where: { isTrashed: false },
      _sum: { size: true },
      _count: { _all: true },
    }),
    prisma.fileAccess.count({ where: { accessedAt: { gte: d7 } } }),
    prisma.fileAccess.count({ where: { accessedAt: { gte: d30 } } }),
    prisma.fileAccess.findMany({
      where: { accessedAt: { gte: d7 } },
      select: { accessedAt: true },
    }),
    prisma.fileAccess.findMany({
      orderBy: { accessedAt: "desc" },
      take: 25,
      include: {
        file: { select: { name: true, mimeType: true } },
        user: { select: { name: true, email: true, avatarUrl: true } },
      },
    }),
    prisma.loginEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { user: { select: { name: true, email: true, avatarUrl: true } } },
    }),
    prisma.fileShortcut.count(),
    prisma.file.count({ where: { spaceId: { not: null }, isTrashed: false } }),
    prisma.share.count(),
    prisma.space.count(),
  ])

  // Users: growth per month over last 12 months
  const growth: { month: string; count: number }[] = []
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    growth.push({ month: key, count: 0 })
  }
  for (const u of allSignups) {
    const key = `${u.createdAt.getFullYear()}-${String(u.createdAt.getMonth() + 1).padStart(2, "0")}`
    const bucket = growth.find((g) => g.month === key)
    if (bucket) bucket.count += 1
  }

  // File types
  const typeBuckets = { image: 0, video: 0, audio: 0, doc: 0, archive: 0, other: 0 }
  const typeBytes = { image: 0, video: 0, audio: 0, doc: 0, archive: 0, other: 0 }
  for (const f of allFilesForTypes) {
    const m = f.mimeType
    const sz = Number(f.size)
    let k: keyof typeof typeBuckets = "other"
    if (m.startsWith("image/")) k = "image"
    else if (m.startsWith("video/")) k = "video"
    else if (m.startsWith("audio/")) k = "audio"
    else if (
      m === "application/pdf" ||
      m.startsWith("text/") ||
      m.includes("officedocument") ||
      m.includes("msword") ||
      m.includes("ms-excel") ||
      m.includes("ms-powerpoint") ||
      /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|md|txt)$/i.test(f.name)
    )
      k = "doc"
    else if (
      m.includes("zip") ||
      m.includes("tar") ||
      m.includes("rar") ||
      m.includes("7z")
    )
      k = "archive"
    typeBuckets[k] += 1
    typeBytes[k] += sz
  }

  // Access by hour-of-day over last 7 days (peak usage window)
  const hourly = new Array(24).fill(0)
  for (const a of accessHourly) hourly[a.accessedAt.getHours()] += 1
  const peakHour = hourly.indexOf(Math.max(...hourly))

  // Potential duplicates: group by name+size among non-trashed files.
  const dupeMap = new Map<string, { name: string; size: number; count: number }>()
  for (const f of allFilesForTypes) {
    const k = `${f.name}::${f.size}`
    const cur = dupeMap.get(k)
    if (cur) cur.count += 1
    else dupeMap.set(k, { name: f.name, size: Number(f.size), count: 1 })
  }
  const duplicates = [...dupeMap.values()]
    .filter((d) => d.count > 1)
    .sort((a, b) => b.count - a.count || b.size - a.size)
    .slice(0, 10)

  // Top storage consumers
  const usageById = new Map(
    usageByOwner.map((u) => [
      u.ownerId,
      { size: Number(u._sum.size ?? BigInt(0)), count: u._count._all },
    ])
  )
  const topOwnerIds = [...usageById.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 10)
    .map(([id]) => id)
  const topOwners = await prisma.user.findMany({
    where: { id: { in: topOwnerIds } },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      storageQuotaBytes: true,
    },
  })
  const topStorage = topOwnerIds
    .map((id) => {
      const u = topOwners.find((x) => x.id === id)
      const agg = usageById.get(id)
      if (!u || !agg) return null
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        usedBytes: agg.size,
        fileCount: agg.count,
        quotaBytes: Number(u.storageQuotaBytes),
      }
    })
    .filter(Boolean)

  // Largest-files needs owner names too
  const largestOwnerIds = Array.from(new Set(largestFiles.map((f) => f.ownerId)))
  const largestOwners = await prisma.user.findMany({
    where: { id: { in: largestOwnerIds } },
    select: { id: true, name: true, email: true },
  })
  const largestWithOwner = largestFiles.map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: Number(f.size),
    createdAt: f.createdAt,
    owner: largestOwners.find((o) => o.id === f.ownerId) ?? null,
  }))

  res.json({
    users: {
      total: userCount,
      active: userCount - disabledCount,
      disabled: disabledCount,
      admins: adminCount,
      newLast30d: recentSignupsWindow,
      growth,
    },
    storage: {
      usedBytes: Number(filesAgg._sum.size ?? BigInt(0)),
      totalQuotaBytes: Number(quotaAgg._sum.storageQuotaBytes ?? BigInt(0)),
      trashedBytes: Number(trashedAgg._sum.size ?? BigInt(0)),
      trashedCount: trashedAgg._count._all,
      topStorage,
    },
    files: {
      total: filesAgg._count._all,
      byType: typeBuckets,
      bytesByType: typeBytes,
      largest: largestWithOwner,
      duplicates,
    },
    activity: {
      accesses7d: accessCount7d,
      accesses30d: accessCount30d,
      hourlyLast7d: hourly,
      peakHour,
      recent: recentAccesses.map((a) => ({
        id: a.id,
        action: a.action,
        accessedAt: a.accessedAt,
        fileName: a.file?.name ?? "(deleted)",
        mimeType: a.file?.mimeType ?? "",
        user: a.user,
      })),
    },
    logins: {
      recent: recentLogins.map((l) => ({
        id: l.id,
        ip: l.ip,
        userAgent: l.userAgent,
        createdAt: l.createdAt,
        user: l.user,
      })),
    },
    sharing: {
      shortcuts: shortcutCount,
      filesInSpaces: sharedFilesCount,
      shareLinks: shareLinksCount,
      spaces: spaceCount,
    },
  })
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
      upgradeRequestedBytes: true,
      disabledAt: true,
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
      upgradeRequestedBytes: u.upgradeRequestedBytes
        ? Number(u.upgradeRequestedBytes)
        : null,
      usedBytes: Number(byOwner.get(u.id) ?? BigInt(0)),
    })),
  })
})

adminRouter.patch("/users/:id", async (req, res) => {
  const me = currentUser(req)
  const body = z
    .object({
      storageQuotaBytes: z.number().int().nonnegative().optional(),
      role: z.enum(["USER", "ADMIN"]).optional(),
      clearUpgradeRequest: z.boolean().optional(),
      disabled: z.boolean().optional(),
    })
    .parse(req.body)

  // Admins cannot demote or disable themselves — keeps at least the acting
  // admin session usable and prevents accidental lockouts.
  if (req.params.id === me.id) {
    if (body.role && body.role !== me.role)
      return res.status(400).json({ error: "cannot_change_own_role" })
    if (body.disabled === true)
      return res.status(400).json({ error: "cannot_disable_self" })
  }

  const data: Record<string, unknown> = {}
  if (body.storageQuotaBytes !== undefined)
    data.storageQuotaBytes = BigInt(body.storageQuotaBytes)
  if (body.role !== undefined) data.role = body.role
  if (body.clearUpgradeRequest) {
    data.upgradeRequestedAt = null
    data.upgradeRequestedBytes = null
  }
  if (body.disabled !== undefined)
    data.disabledAt = body.disabled ? new Date() : null

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
      upgradeRequestedBytes: true,
      disabledAt: true,
    },
  })
  res.json({
    ...u,
    storageQuotaBytes: Number(u.storageQuotaBytes),
    upgradeRequestedBytes: u.upgradeRequestedBytes
      ? Number(u.upgradeRequestedBytes)
      : null,
  })
})
