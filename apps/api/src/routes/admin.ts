import { Router } from "express"
import { z } from "zod"
import os from "node:os"
import fsp from "node:fs/promises"
import { prisma } from "../db/prisma.js"
import { redis } from "../db/redis.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { assertUserRootFolderId } from "../lib/access.js"
import { removeFile, STORAGE_ROOT } from "../storage/local.js"
import { removeAudioVariants } from "../lib/audioTracks.js"
import { notify } from "../lib/notify.js"
import { recentLogs } from "../lib/logbuf.js"
import { backfillProgress, backfillThumbnails, toolStatus } from "../lib/thumbnails.js"
import { fileCategory } from "../lib/fileType.js"
import { buildUserDetail } from "../lib/userDetail.js"

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

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
    recycleBinAgg,
    recycleBinFolderCount,
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
      // User bins only — items permanently deleted into the admin recycle bin
      // (deletedAt set) are reported separately under `recycleBin`.
      where: { isTrashed: true, deletedAt: null },
    }),
    prisma.file.findMany({
      where: { isTrashed: false },
      select: { id: true, mimeType: true, size: true, name: true },
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
    // Admin recycle bin — files permanently deleted by users but retained.
    prisma.file.aggregate({
      _count: { _all: true },
      _sum: { size: true },
      where: { deletedAt: { not: null } },
    }),
    prisma.folder.count({ where: { deletedAt: { not: null } } }),
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
    const k = fileCategory(f.mimeType, f.name)
    const sz = Number(f.size)
    typeBuckets[k] += 1
    typeBytes[k] += sz
  }

  // Access by hour-of-day over last 7 days (peak usage window)
  const hourly = new Array(24).fill(0)
  for (const a of accessHourly) hourly[a.accessedAt.getHours()] += 1
  const peakHour = hourly.indexOf(Math.max(...hourly))

  // Potential duplicates: group by name+size among non-trashed files. Keeps the
  // first file id seen per group as a clickable sample — opening it previews
  // one representative copy rather than every match.
  const dupeMap = new Map<
    string,
    { name: string; size: number; count: number; sampleId: string }
  >()
  for (const f of allFilesForTypes) {
    const k = `${f.name}::${f.size}`
    const cur = dupeMap.get(k)
    if (cur) cur.count += 1
    else dupeMap.set(k, { name: f.name, size: Number(f.size), count: 1, sampleId: f.id })
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
      recycleBinBytes: Number(recycleBinAgg._sum.size ?? BigInt(0)),
      recycleBinCount: recycleBinAgg._count._all + recycleBinFolderCount,
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
        fileId: a.file ? a.fileId : null,
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

// Every space on the instance, regardless of ownership/membership — powers
// the admin "Spaces" tab so moderation isn't limited to spaces the admin
// happens to belong to.
adminRouter.get("/spaces", async (_req, res) => {
  const spaces = await prisma.space.findMany({
    orderBy: { createdAt: "desc" },
    include: { owner: true, _count: { select: { members: true } } },
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
      ownerName: s.owner?.name ?? null,
      ownerEmail: s.owner?.email ?? null,
      isPublic: s.isPublic,
      // +1 for the owner, who has no SpaceMember row.
      memberCount: s._count.members + 1,
      createdAt: s.createdAt,
    })),
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

  const before = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { storageQuotaBytes: true, upgradeRequestedAt: true },
  })
  if (!before) return res.status(404).json({ error: "not_found" })

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

  // Was this an upgrade-request resolution (approve or dismiss), a plain
  // quota edit, or neither? Each gets a distinct message so the user knows
  // what actually happened without digging into the admin panel.
  if (before.upgradeRequestedAt && body.clearUpgradeRequest) {
    if (u.storageQuotaBytes > before.storageQuotaBytes) {
      void notify(u.id, {
        type: "quota_upgrade_approved",
        title: "Your storage upgrade request was approved",
        body: `New limit: ${formatBytes(Number(u.storageQuotaBytes))}`,
      })
    } else {
      void notify(u.id, {
        type: "quota_upgrade_denied",
        title: "Your storage upgrade request was dismissed",
      })
    }
  } else if (
    body.storageQuotaBytes !== undefined &&
    u.storageQuotaBytes !== before.storageQuotaBytes
  ) {
    void notify(u.id, {
      type: "quota_changed",
      title: `Your storage limit was changed to ${formatBytes(Number(u.storageQuotaBytes))}`,
    })
  }

  res.json({
    ...u,
    storageQuotaBytes: Number(u.storageQuotaBytes),
    upgradeRequestedBytes: u.upgradeRequestedBytes
      ? Number(u.upgradeRequestedBytes)
      : null,
  })
})

// Powers the "click a user to see their whole lifecycle" drawer in the admin
// Users tab — same aggregate the user themselves gets from /api/me/detail.
adminRouter.get("/users/:id/detail", async (req, res) => {
  const data = await buildUserDetail(req.params.id)
  if (!data) return res.status(404).json({ error: "not_found" })
  res.json(data)
})

// Full metadata for a single file, regardless of owner or trash state — lets
// the admin dashboard open a preview for any file surfaced in a summary panel
// (largest files, duplicates, recent activity, recycle bin), which normally
// only carries a partial, aggregated shape. The actual bytes are then served
// by the ordinary /api/files/:id/download|preview routes, which grant
// read-only access to admins (see lib/access.ts).
adminRouter.get("/files/:id", async (req, res) => {
  const file = await prisma.file.findUnique({ where: { id: req.params.id } })
  if (!file) return res.status(404).json({ error: "not_found" })
  res.json({ ...file, size: Number(file.size) })
})

// --- Admin recycle bin -------------------------------------------------------
// Everything users have permanently deleted lives here (deletedAt set) and is
// never removed automatically. Only an admin can restore it to the owner's
// drive or purge it for good (DB row + blob on disk).

// Collect every folder id in the subtree rooted at `rootId` (inclusive).
async function collectFolderSubtree(rootId: string): Promise<string[]> {
  const ids = [rootId]
  const seen = new Set(ids)
  let frontier = [rootId]
  while (frontier.length) {
    const children = await prisma.folder.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    })
    frontier = []
    for (const c of children) {
      if (!seen.has(c.id)) {
        seen.add(c.id)
        ids.push(c.id)
        frontier.push(c.id)
      }
    }
  }
  return ids
}

// Listing. Deleted folders collapse their contents: a deleted folder is shown
// once (with a rolled-up file count + size for its whole subtree) and the files
// inside it are not listed separately. Only "top-level" deletions are returned —
// a deleted item whose parent folder is itself deleted is nested under it.
adminRouter.get("/recycle-bin", async (_req, res) => {
  const [delFolders, delFiles] = await Promise.all([
    prisma.folder.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        name: true,
        color: true,
        parentId: true,
        ownerId: true,
        deletedById: true,
        deletedAt: true,
      },
    }),
    prisma.file.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        folderId: true,
        ownerId: true,
        deletedById: true,
        deletedAt: true,
      },
    }),
  ])

  const deletedFolderIds = new Set(delFolders.map((f) => f.id))
  const childrenOf = new Map<string, string[]>()
  for (const f of delFolders) {
    if (f.parentId && deletedFolderIds.has(f.parentId)) {
      const arr = childrenOf.get(f.parentId) ?? []
      arr.push(f.id)
      childrenOf.set(f.parentId, arr)
    }
  }
  const filesByFolder = new Map<string, typeof delFiles>()
  for (const file of delFiles) {
    const arr = filesByFolder.get(file.folderId) ?? []
    arr.push(file)
    filesByFolder.set(file.folderId, arr)
  }

  function subtreeStats(rootId: string) {
    let bytes = 0
    let fileCount = 0
    let folderCount = 0
    const stack = [rootId]
    const seen = new Set<string>()
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      folderCount += 1
      for (const file of filesByFolder.get(id) ?? []) {
        bytes += Number(file.size)
        fileCount += 1
      }
      for (const c of childrenOf.get(id) ?? []) stack.push(c)
    }
    // Exclude the root itself from the "contains N folders" count.
    return { bytes, fileCount, folderCount: folderCount - 1 }
  }

  // Resolve owner + deleter identities in one query.
  const userIds = new Set<string>()
  for (const x of [...delFolders, ...delFiles]) {
    userIds.add(x.ownerId)
    if (x.deletedById) userIds.add(x.deletedById)
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, email: true, avatarUrl: true },
  })
  const userById = new Map(users.map((u) => [u.id, u]))
  const person = (id: string | null) => (id ? userById.get(id) ?? null : null)

  const topFolders = delFolders
    .filter((f) => !(f.parentId && deletedFolderIds.has(f.parentId)))
    .map((f) => {
      const st = subtreeStats(f.id)
      return {
        id: f.id,
        name: f.name,
        color: f.color,
        owner: person(f.ownerId),
        deletedBy: person(f.deletedById),
        deletedAt: f.deletedAt,
        sizeBytes: st.bytes,
        fileCount: st.fileCount,
        folderCount: st.folderCount,
      }
    })
    .sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0))

  const topFiles = delFiles
    .filter((f) => !deletedFolderIds.has(f.folderId))
    .map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: Number(f.size),
      owner: person(f.ownerId),
      deletedBy: person(f.deletedById),
      deletedAt: f.deletedAt,
    }))
    .sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0))

  const totalBytes = delFiles.reduce((s, f) => s + Number(f.size), 0)
  res.json({
    folders: topFolders,
    files: topFiles,
    totals: {
      folders: delFolders.length,
      files: delFiles.length,
      bytes: totalBytes,
    },
  })
})

const RecycleItemSchema = z.object({
  type: z.enum(["file", "folder"]),
  id: z.string(),
  // Optional destination folder — lets an admin drop a restored item into any
  // folder in any user's drive instead of its original spot. Omitted = restore
  // in place.
  destFolderId: z.string().optional(),
})

// Full folder tree (id/name/parentId) for an arbitrary user's drive, so the
// recycle bin "move to" picker can browse anywhere in the system, not just
// the admin's own drive. Mirrors GET /api/folders/tree/me.
adminRouter.get("/users/:id/folders/tree", async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!target) return res.status(404).json({ error: "not_found" })
  const rootId = target.rootFolderId ?? (await assertUserRootFolderId(target))
  const folders = await prisma.folder.findMany({
    where: { ownerId: target.id, spaceId: null, isTrashed: false },
    select: { id: true, name: true, parentId: true },
  })
  res.json({ rootId, folders })
})

// Restore an item to its owner's drive (clears deletedAt + isTrashed on the
// whole subtree). If a destFolderId is given, the item is reparented there
// instead of restored to its original location — it can land in any user's
// drive. If the original parent has since been purged and no destination was
// given, the folder becomes an orphan, but the data is recovered — an
// acceptable trade-off.
adminRouter.post("/recycle-bin/restore", async (req, res) => {
  const { type, id, destFolderId } = RecycleItemSchema.parse(req.body)
  const restore = { deletedAt: null, deletedById: null, isTrashed: false }

  let dest: { id: string } | null = null
  if (destFolderId) {
    const target = await prisma.folder.findUnique({ where: { id: destFolderId } })
    if (!target || target.deletedAt) return res.status(400).json({ error: "invalid_target" })
    dest = target
  }

  if (type === "file") {
    const file = await prisma.file.findUnique({ where: { id } })
    if (!file || !file.deletedAt) return res.status(404).json({ error: "not_found" })
    await prisma.file.update({
      where: { id },
      data: dest ? { ...restore, folderId: dest.id } : restore,
    })
    return res.json({ ok: true })
  }

  const folder = await prisma.folder.findUnique({ where: { id } })
  if (!folder || !folder.deletedAt) return res.status(404).json({ error: "not_found" })
  const ids = await collectFolderSubtree(id)
  if (dest && ids.includes(dest.id))
    return res.status(400).json({ error: "cycle" })
  await prisma.$transaction([
    prisma.file.updateMany({
      where: { folderId: { in: ids }, deletedAt: { not: null } },
      data: restore,
    }),
    prisma.folder.updateMany({
      where: { id: { in: ids.filter((x) => x !== id) }, deletedAt: { not: null } },
      data: restore,
    }),
    prisma.folder.update({
      where: { id },
      data: dest ? { ...restore, parentId: dest.id } : restore,
    }),
  ])
  res.json({ ok: true })
})

// Purge an item for good: remove the DB row(s) and the blob(s) on disk. For a
// folder the FK cascade removes the subtree rows, so blob keys are gathered
// first.
adminRouter.post("/recycle-bin/purge", async (req, res) => {
  const { type, id } = RecycleItemSchema.parse(req.body)

  if (type === "file") {
    const file = await prisma.file.findUnique({
      where: { id },
      include: { versions: { select: { storageKey: true } } },
    })
    if (!file || !file.deletedAt) return res.status(404).json({ error: "not_found" })
    await prisma.file.delete({ where: { id } }) // cascades to versions
    try { removeFile(file.storageKey) } catch {}
    if (file.thumbnailKey) { try { removeFile(file.thumbnailKey) } catch {} }
    for (const v of file.versions) { try { removeFile(v.storageKey) } catch {} }
    removeAudioVariants(file.id)
    return res.json({ ok: true })
  }

  const folder = await prisma.folder.findUnique({ where: { id } })
  if (!folder || !folder.deletedAt) return res.status(404).json({ error: "not_found" })
  const ids = await collectFolderSubtree(id)
  const [files, folders] = await Promise.all([
    prisma.file.findMany({
      where: { folderId: { in: ids } },
      select: {
        id: true,
        storageKey: true,
        thumbnailKey: true,
        versions: { select: { storageKey: true } },
      },
    }),
    prisma.folder.findMany({
      where: { id: { in: ids } },
      select: { thumbnailKey: true },
    }),
  ])
  await prisma.folder.delete({ where: { id } }) // cascades to the subtree
  for (const f of files) {
    try { removeFile(f.storageKey) } catch {}
    if (f.thumbnailKey) { try { removeFile(f.thumbnailKey) } catch {} }
    for (const v of f.versions) { try { removeFile(v.storageKey) } catch {} }
    removeAudioVariants(f.id)
  }
  for (const f of folders) {
    if (f.thumbnailKey) { try { removeFile(f.thumbnailKey) } catch {} }
  }
  res.json({ ok: true })
})

// Purge everything in the recycle bin.
adminRouter.post("/recycle-bin/purge-all", async (_req, res) => {
  const [files, folders] = await Promise.all([
    prisma.file.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        storageKey: true,
        thumbnailKey: true,
        versions: { select: { storageKey: true } },
      },
    }),
    prisma.folder.findMany({
      where: { deletedAt: { not: null } },
      select: { thumbnailKey: true },
    }),
  ])
  await prisma.$transaction([
    prisma.file.deleteMany({ where: { deletedAt: { not: null } } }),
    prisma.folder.deleteMany({ where: { deletedAt: { not: null } } }),
  ])
  for (const f of files) {
    try { removeFile(f.storageKey) } catch {}
    if (f.thumbnailKey) { try { removeFile(f.thumbnailKey) } catch {} }
    for (const v of f.versions) { try { removeFile(v.storageKey) } catch {} }
    removeAudioVariants(f.id)
  }
  for (const f of folders) {
    if (f.thumbnailKey) { try { removeFile(f.thumbnailKey) } catch {} }
  }
  res.json({ ok: true, files: files.length, folders: folders.length })
})

// --- server logs -----------------------------------------------------------
// Recent console output from this process, newest last. `q` filters by
// substring (the panel uses `[thumb]` to isolate the thumbnail pipeline).
adminRouter.get("/logs", (req, res) => {
  const q = String(req.query.q ?? "").toLowerCase()
  const limit = Math.min(Number(req.query.limit) || 300, 2000)
  const entries = recentLogs().filter((e) => !q || e.msg.toLowerCase().includes(q))
  res.json({ entries: entries.slice(-limit) })
})

// --- thumbnail pipeline ----------------------------------------------------
// Health of the thumbnailer: which external binaries actually exist on this
// box, plus how the files break down by generation state.
adminRouter.get("/thumbnails", async (_req, res) => {
  const [tools, states, missing] = await Promise.all([
    toolStatus(),
    prisma.file.groupBy({
      by: ["thumbnailState"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.file.count({ where: { deletedAt: null, thumbnailKey: null } }),
  ])
  res.json({
    tools,
    missing,
    progress: backfillProgress(),
    states: states.map((s) => ({ state: s.thumbnailState ?? "pending", count: s._count._all })),
  })
})

// Kick off a backfill over every file missing a thumbnail. Returns immediately;
// poll GET /thumbnails for progress.
// ponytail: runs in the background on this process, no job queue — the
// concurrency gate in lib/thumbnails keeps it from eating the box.
adminRouter.post("/thumbnails/rebuild", (req, res) => {
  const { includeFailed = true } = z
    .object({ includeFailed: z.boolean().optional() })
    .parse(req.body ?? {})

  if (backfillProgress().running) return res.status(409).json({ error: "already_running" })
  void backfillThumbnails(includeFailed)
  res.json({ ok: true })
})
