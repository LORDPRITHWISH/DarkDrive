import { prisma } from "../db/prisma.js"
import { fileCategory } from "./fileType.js"

// Everything about one user: what they've stored (files, folders, trash,
// retained deletions, type breakdown), their activity (views/downloads over
// time, recent events), their login history, and their sharing footprint.
// Aggregated per-request — a single user's dataset is small enough that this
// stays cheap. Served both to admins (any user, /api/admin/users/:id/detail)
// and to the user themselves (/api/me/detail, the profile page).
// Returns null when no such user exists.
export async function buildUserDetail(id: string) {
  const now = new Date()
  const dayMs = 86400000
  const d7 = new Date(now.getTime() - 7 * dayMs)
  const d30 = new Date(now.getTime() - 30 * dayMs)

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
      disabledAt: true,
      storageQuotaBytes: true,
      upgradeRequestedAt: true,
      upgradeRequestedBytes: true,
    },
  })
  if (!user) return null

  const [
    ownedFiles,
    trashedAgg,
    recycleAgg,
    folderCount,
    views7d,
    downloads7d,
    views30d,
    downloads30d,
    totalEvents,
    recentAccesses,
    lastAccess,
    loginTotal,
    recentLogins,
    shareLinks,
    shortcuts,
    spacesOwned,
    memberships,
  ] = await Promise.all([
    prisma.file.findMany({
      where: { ownerId: id, isTrashed: false },
      select: { id: true, name: true, mimeType: true, size: true, createdAt: true },
    }),
    prisma.file.aggregate({
      _count: { _all: true },
      _sum: { size: true },
      where: { ownerId: id, isTrashed: true, deletedAt: null },
    }),
    prisma.file.aggregate({
      _count: { _all: true },
      _sum: { size: true },
      where: { ownerId: id, deletedAt: { not: null } },
    }),
    prisma.folder.count({
      where: { ownerId: id, isTrashed: false, deletedAt: null },
    }),
    prisma.fileAccess.count({
      where: { userId: id, action: "view", accessedAt: { gte: d7 } },
    }),
    prisma.fileAccess.count({
      where: { userId: id, action: "download", accessedAt: { gte: d7 } },
    }),
    prisma.fileAccess.count({
      where: { userId: id, action: "view", accessedAt: { gte: d30 } },
    }),
    prisma.fileAccess.count({
      where: { userId: id, action: "download", accessedAt: { gte: d30 } },
    }),
    prisma.fileAccess.count({ where: { userId: id } }),
    prisma.fileAccess.findMany({
      where: { userId: id },
      orderBy: { accessedAt: "desc" },
      take: 30,
      include: { file: { select: { name: true, mimeType: true } } },
    }),
    prisma.fileAccess.findFirst({
      where: { userId: id },
      orderBy: { accessedAt: "desc" },
      select: { accessedAt: true },
    }),
    prisma.loginEvent.count({ where: { userId: id } }),
    prisma.loginEvent.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, ip: true, userAgent: true, createdAt: true },
    }),
    prisma.share.count({ where: { createdById: id } }),
    prisma.fileShortcut.count({ where: { file: { ownerId: id } } }),
    prisma.space.findMany({
      where: { ownerId: id },
      select: {
        id: true,
        name: true,
        isPublic: true,
        _count: { select: { members: true } },
      },
    }),
    prisma.spaceMember.findMany({
      where: { userId: id },
      select: { role: true, space: { select: { id: true, name: true } } },
    }),
  ])

  // Storage rollup + type breakdown over the user's live (non-trashed) files.
  const byType = { image: 0, video: 0, audio: 0, doc: 0, archive: 0, other: 0 }
  const bytesByType = { image: 0, video: 0, audio: 0, doc: 0, archive: 0, other: 0 }
  let usedBytes = 0
  for (const f of ownedFiles) {
    const sz = Number(f.size)
    usedBytes += sz
    const k = fileCategory(f.mimeType, f.name)
    byType[k] += 1
    bytesByType[k] += sz
  }
  const quotaBytes = Number(user.storageQuotaBytes)

  const largestFiles = [...ownedFiles]
    .sort((a, b) => Number(b.size) - Number(a.size))
    .slice(0, 10)
    .map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: Number(f.size),
      createdAt: f.createdAt,
    }))

  const recentFiles = [...ownedFiles]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: Number(f.size),
      createdAt: f.createdAt,
    }))

  return {
    user: {
      ...user,
      storageQuotaBytes: quotaBytes,
      upgradeRequestedBytes: user.upgradeRequestedBytes
        ? Number(user.upgradeRequestedBytes)
        : null,
    },
    storage: {
      usedBytes,
      quotaBytes,
      pct: quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0,
      fileCount: ownedFiles.length,
      folderCount,
      trashedCount: trashedAgg._count._all,
      trashedBytes: Number(trashedAgg._sum.size ?? BigInt(0)),
      recycleBinCount: recycleAgg._count._all,
      recycleBinBytes: Number(recycleAgg._sum.size ?? BigInt(0)),
      byType,
      bytesByType,
    },
    largestFiles,
    recentFiles,
    activity: {
      views7d,
      downloads7d,
      views30d,
      downloads30d,
      total: totalEvents,
      lastActiveAt: lastAccess?.accessedAt ?? null,
      recent: recentAccesses.map((a) => ({
        id: a.id,
        action: a.action,
        accessedAt: a.accessedAt,
        fileId: a.fileId,
        fileName: a.file?.name ?? "(deleted)",
        mimeType: a.file?.mimeType ?? "",
      })),
    },
    logins: {
      total: loginTotal,
      lastLoginAt: recentLogins[0]?.createdAt ?? null,
      recent: recentLogins,
    },
    sharing: {
      shareLinks,
      shortcuts,
      spacesOwned: spacesOwned.map((s) => ({
        id: s.id,
        name: s.name,
        isPublic: s.isPublic,
        memberCount: s._count.members,
      })),
      memberships: memberships.map((m) => ({
        spaceId: m.space.id,
        name: m.space.name,
        role: m.role,
      })),
    },
  }
}
