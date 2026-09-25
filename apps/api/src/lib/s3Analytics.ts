import fs from "node:fs"
import path from "node:path"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { env } from "../env.js"
import { getActiveDriverName, isS3Configured } from "../storage/index.js"
import { fileCategory } from "./fileType.js"

// Everything here reads keys the way storage/index.ts writes them: a blob on
// S3 is any key prefixed "s3:", and the bucket holds it under the raw key
// (prefix stripped).
const S3_LIKE = "s3:%"
const DAY_MS = 86_400_000
const DAILY_WINDOW = 30

const n = (v: bigint | number | null | undefined) => Number(v ?? 0)

// --- database view ---------------------------------------------------------
// What the app believes lives where. Cheap (a handful of aggregate queries)
// and available whether or not S3 is configured.

type Split = {
  backend: "s3" | "local" | "legacy"
  state: "live" | "trash" | "recycle"
  count: number
  bytes: number
}

async function fileSplit(): Promise<Split[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      backend: Split["backend"]
      state: Split["state"]
      count: number
      bytes: bigint
    }>
  >`
    SELECT
      CASE WHEN "storageKey" LIKE 's3:%' THEN 's3'
           WHEN "storageKey" LIKE 'local:%' THEN 'local'
           ELSE 'legacy' END AS backend,
      CASE WHEN "deletedAt" IS NOT NULL THEN 'recycle'
           WHEN "isTrashed" THEN 'trash'
           ELSE 'live' END AS state,
      COUNT(*)::int AS count,
      COALESCE(SUM(size), 0)::bigint AS bytes
    FROM "File"
    GROUP BY 1, 2`
  return rows.map((r) => ({ ...r, bytes: n(r.bytes) }))
}

async function versionSplit() {
  const rows = await prisma.$queryRaw<
    Array<{ backend: string; count: number; bytes: bigint }>
  >`
    SELECT
      CASE WHEN "storageKey" LIKE 's3:%' THEN 's3'
           WHEN "storageKey" LIKE 'local:%' THEN 'local'
           ELSE 'legacy' END AS backend,
      COUNT(*)::int AS count,
      COALESCE(SUM(size), 0)::bigint AS bytes
    FROM "FileVersion"
    GROUP BY 1`
  return rows.map((r) => ({
    backend: r.backend,
    count: r.count,
    bytes: n(r.bytes),
  }))
}

async function dailyUploads() {
  const since = new Date(Date.now() - (DAILY_WINDOW - 1) * DAY_MS)
  since.setUTCHours(0, 0, 0, 0)
  const rows = await prisma.$queryRaw<
    Array<{ day: Date; count: number; bytes: bigint }>
  >`
    SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day,
           COUNT(*)::int AS count,
           COALESCE(SUM(size), 0)::bigint AS bytes
    FROM "File"
    WHERE "storageKey" LIKE ${S3_LIKE} AND "createdAt" >= ${since}
    GROUP BY 1`
  const byDay = new Map(
    rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), r])
  )
  // Zero-fill so the chart has one bar per calendar day, not just active ones.
  return Array.from({ length: DAILY_WINDOW }, (_, i) => {
    const day = new Date(since.getTime() + i * DAY_MS)
      .toISOString()
      .slice(0, 10)
    const r = byDay.get(day)
    return { day, count: r?.count ?? 0, bytes: n(r?.bytes) }
  })
}

export async function dbOverview() {
  const s3Where = { storageKey: { startsWith: "s3:" } }
  const [
    files,
    versions,
    daily,
    byMime,
    topOwners,
    largest,
    span,
    thumbs,
    storyboards,
    folderThumbs,
    spaceLogos,
  ] = await Promise.all([
    fileSplit(),
    versionSplit(),
    dailyUploads(),
    prisma.file.groupBy({
      by: ["mimeType"],
      where: s3Where,
      _count: { _all: true },
      _sum: { size: true },
    }),
    prisma.file.groupBy({
      by: ["ownerId"],
      where: s3Where,
      _count: { _all: true },
      _sum: { size: true },
      orderBy: { _sum: { size: "desc" } },
      take: 10,
    }),
    prisma.file.findMany({
      where: s3Where,
      orderBy: { size: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        size: true,
        mimeType: true,
        createdAt: true,
        isTrashed: true,
        deletedAt: true,
        owner: { select: { name: true, email: true } },
      },
    }),
    prisma.file.aggregate({
      where: s3Where,
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
    prisma.file.count({ where: { thumbnailKey: { startsWith: "s3:" } } }),
    prisma.file.count({ where: { storyboardKey: { startsWith: "s3:" } } }),
    prisma.folder.count({ where: { thumbnailKey: { startsWith: "s3:" } } }),
    prisma.space.count({ where: { logoKey: { startsWith: "s3:" } } }),
  ])

  const categories = new Map<string, { count: number; bytes: number }>()
  for (const m of byMime) {
    const cat = fileCategory(m.mimeType, "")
    const c = categories.get(cat) ?? { count: 0, bytes: 0 }
    c.count += m._count._all
    c.bytes += n(m._sum.size)
    categories.set(cat, c)
  }

  const owners = await prisma.user.findMany({
    where: { id: { in: topOwners.map((o) => o.ownerId) } },
    select: { id: true, name: true, email: true, avatarUrl: true },
  })
  const ownerById = new Map(owners.map((o) => [o.id, o]))

  return {
    files,
    versions,
    daily,
    categories: [...categories.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.bytes - a.bytes),
    mimeTypes: byMime
      .map((m) => ({
        mimeType: m.mimeType,
        count: m._count._all,
        bytes: n(m._sum.size),
      }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 12),
    topOwners: topOwners.map((o) => ({
      id: o.ownerId,
      name: ownerById.get(o.ownerId)?.name ?? "(deleted user)",
      email: ownerById.get(o.ownerId)?.email ?? "",
      avatarUrl: ownerById.get(o.ownerId)?.avatarUrl ?? null,
      count: o._count._all,
      bytes: n(o._sum.size),
    })),
    largest: largest.map((f) => ({
      id: f.id,
      name: f.name,
      size: n(f.size),
      mimeType: f.mimeType,
      createdAt: f.createdAt.toISOString(),
      state: f.deletedAt ? "recycle" : f.isTrashed ? "trash" : "live",
      owner: f.owner.name,
    })),
    firstUploadAt: span._min.createdAt?.toISOString() ?? null,
    lastUploadAt: span._max.createdAt?.toISOString() ?? null,
    derivatives: {
      thumbnails: thumbs,
      storyboards,
      folderThumbnails: folderThumbs,
      spaceLogos,
    },
  }
}

// --- live bucket view ------------------------------------------------------

function dirStats(dir: string): {
  files: number
  bytes: number
  oldestMs: number | null
} {
  let files = 0
  let bytes = 0
  let oldestMs: number | null = null
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return { files, bytes, oldestMs }
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      const sub = dirStats(p)
      files += sub.files
      bytes += sub.bytes
      if (
        sub.oldestMs !== null &&
        (oldestMs === null || sub.oldestMs < oldestMs)
      )
        oldestMs = sub.oldestMs
    } else if (e.isFile()) {
      try {
        const s = fs.statSync(p)
        files++
        bytes += s.size
        if (oldestMs === null || s.mtimeMs < oldestMs) oldestMs = s.mtimeMs
      } catch {}
    }
  }
  return { files, bytes, oldestMs }
}

function mask(v: string): string {
  return v.length <= 4
    ? "••••"
    : `${"•".repeat(Math.min(8, v.length - 4))}${v.slice(-4)}`
}

export async function liveOverview() {
  if (!isS3Configured()) return null
  const { client, BUCKET, s3Metrics, S3_CACHE_DIR } =
    await import("../storage/s3.js")
  const { HeadBucketCommand, GetBucketVersioningCommand } =
    await import("@aws-sdk/client-s3")

  let reachable = false
  let latencyMs: number | null = null
  let error: string | null = null
  const started = Date.now()
  try {
    await client.send(new HeadBucketCommand({ Bucket: BUCKET }))
    reachable = true
    latencyMs = Date.now() - started
  } catch (err) {
    error =
      (err as Error)?.message ||
      (err as { name?: string })?.name ||
      "unreachable"
  }

  // Not every S3-compatible provider implements versioning — "unsupported"
  // is a real answer, not a failure.
  let versioning: string = "unknown"
  if (reachable) {
    try {
      const v = await client.send(
        new GetBucketVersioningCommand({ Bucket: BUCKET })
      )
      versioning = v.Status ?? "Disabled"
    } catch {
      versioning = "unsupported"
    }
  }

  const cache = dirStats(S3_CACHE_DIR)

  return {
    config: {
      endpoint: env.S3_ENDPOINT ?? "(AWS default)",
      region: env.S3_REGION,
      bucket: BUCKET,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      accessKeyId: mask(env.S3_ACCESS_KEY_ID ?? ""),
    },
    connectivity: {
      reachable,
      latencyMs,
      error,
      checkedAt: new Date().toISOString(),
    },
    versioning,
    metrics: {
      since: new Date(s3Metrics.since).toISOString(),
      ops: Object.entries(s3Metrics.ops)
        .map(([op, s]) => ({
          op,
          ...s,
          avgMs: s.count ? Math.round(s.totalMs / s.count) : 0,
          lastAt: s.lastAt ? new Date(s.lastAt).toISOString() : null,
        }))
        .sort((a, b) => b.count - a.count),
    },
    cache: {
      dir: S3_CACHE_DIR,
      files: cache.files,
      bytes: cache.bytes,
      oldestAt: cache.oldestMs ? new Date(cache.oldestMs).toISOString() : null,
    },
  }
}

export async function s3Overview() {
  const [db, live] = await Promise.all([dbOverview(), liveOverview()])
  return {
    configured: isS3Configured(),
    activeDriver: getActiveDriverName(),
    db,
    live,
  }
}

// --- full bucket scan ------------------------------------------------------
// Lists every object in the bucket and reconciles it against the DB: what each
// object is, which DB references point at nothing (missing = broken files),
// and which objects nothing points at (orphans = paid-for garbage).
// ponytail: holds every referenced key in memory — fine into the low
// millions of objects; stream the reconciliation through a temp table if the
// bucket ever outgrows that.

type Kind =
  | "file"
  | "version"
  | "thumbnail"
  | "storyboard"
  | "folderThumbnail"
  | "spaceLogo"
  | "derivedAudio"
  | "orphan"

const SIZE_BUCKETS = [
  { label: "< 1 MB", max: 1024 ** 2 },
  { label: "1–10 MB", max: 10 * 1024 ** 2 },
  { label: "10–100 MB", max: 100 * 1024 ** 2 },
  { label: "100 MB–1 GB", max: 1024 ** 3 },
  { label: "> 1 GB", max: Infinity },
]
const SAMPLE = 25

export type ScanResult = {
  objects: number
  bytes: number
  byKind: Array<{ kind: Kind; count: number; bytes: number }>
  byStorageClass: Array<{ storageClass: string; count: number; bytes: number }>
  bySize: Array<{ label: string; count: number; bytes: number }>
  byTopPrefix: Array<{ prefix: string; count: number; bytes: number }>
  oldestObject: { key: string; at: string } | null
  newestObject: { key: string; at: string } | null
  largestObject: { key: string; size: number } | null
  orphans: {
    count: number
    bytes: number
    sample: Array<{ key: string; size: number; lastModified: string | null }>
  }
  missing: {
    count: number
    byKind: Array<{ kind: Kind; count: number }>
    sample: Array<{
      kind: Kind
      key: string
      fileId: string | null
      name: string | null
    }>
  }
  dbBytesOnS3: number
}

export type ScanProgress = {
  running: boolean
  startedAt: string | null
  finishedAt: string | null
  pages: number
  objects: number
  error: string | null
  result: ScanResult | null
}

let scan: ScanProgress = {
  running: false,
  startedAt: null,
  finishedAt: null,
  pages: 0,
  objects: 0,
  error: null,
  result: null,
}

export function scanProgress(): ScanProgress {
  return scan
}

type Ref = { kind: Kind; fileId: string | null; name: string | null }

async function referencedKeys(): Promise<Map<string, Ref>> {
  const s3 = { startsWith: "s3:" }
  const [files, thumbs, boards, versions, folders, spaces] = await Promise.all([
    prisma.file.findMany({
      where: { storageKey: s3 },
      select: { id: true, name: true, storageKey: true },
    }),
    prisma.file.findMany({
      where: { thumbnailKey: s3 },
      select: { id: true, name: true, thumbnailKey: true },
    }),
    prisma.file.findMany({
      where: { storyboardKey: s3 },
      select: { id: true, name: true, storyboardKey: true },
    }),
    prisma.fileVersion.findMany({
      where: { storageKey: s3 },
      select: { storageKey: true, file: { select: { id: true, name: true } } },
    }),
    prisma.folder.findMany({
      where: { thumbnailKey: s3 },
      select: { name: true, thumbnailKey: true },
    }),
    prisma.space.findMany({
      where: { logoKey: s3 },
      select: { name: true, logoKey: true },
    }),
  ])
  const refs = new Map<string, Ref>()
  const add = (key: string | null, ref: Ref) => {
    if (key?.startsWith("s3:")) refs.set(key.slice(3), ref)
  }
  for (const f of files)
    add(f.storageKey, { kind: "file", fileId: f.id, name: f.name })
  for (const f of thumbs)
    add(f.thumbnailKey, { kind: "thumbnail", fileId: f.id, name: f.name })
  for (const f of boards)
    add(f.storyboardKey, { kind: "storyboard", fileId: f.id, name: f.name })
  for (const v of versions)
    add(v.storageKey, { kind: "version", fileId: v.file.id, name: v.file.name })
  for (const f of folders)
    add(f.thumbnailKey, { kind: "folderThumbnail", fileId: null, name: f.name })
  for (const s of spaces)
    add(s.logoKey, { kind: "spaceLogo", fileId: null, name: s.name })
  return refs
}

export async function runBucketScan(): Promise<void> {
  if (scan.running || !isS3Configured()) return
  scan = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    pages: 0,
    objects: 0,
    error: null,
    result: scan.result,
  }
  try {
    const { client, BUCKET } = await import("../storage/s3.js")
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3")

    const [refs, liveFileIds, dbBytes] = await Promise.all([
      referencedKeys(),
      prisma.file
        .findMany({ select: { id: true } })
        .then((r) => new Set(r.map((f) => f.id))),
      prisma.$queryRaw<Array<{ bytes: bigint }>>(
        Prisma.sql`SELECT COALESCE(SUM(size), 0)::bigint AS bytes FROM "File" WHERE "storageKey" LIKE ${S3_LIKE}`
      ),
    ])

    const byKind = new Map<Kind, { count: number; bytes: number }>()
    const byClass = new Map<string, { count: number; bytes: number }>()
    const byPrefix = new Map<string, { count: number; bytes: number }>()
    const bySize = SIZE_BUCKETS.map((b) => ({
      label: b.label,
      count: 0,
      bytes: 0,
    }))
    const seen = new Set<string>()
    const orphanSample: ScanResult["orphans"]["sample"] = []
    let orphanCount = 0
    let orphanBytes = 0
    let objects = 0
    let bytes = 0
    let oldest: { key: string; t: number } | null = null
    let newest: { key: string; t: number } | null = null
    let largest: { key: string; size: number } | null = null

    const bump = <K>(
      m: Map<K, { count: number; bytes: number }>,
      k: K,
      size: number
    ) => {
      const v = m.get(k) ?? { count: 0, bytes: 0 }
      v.count++
      v.bytes += size
      m.set(k, v)
    }

    let ContinuationToken: string | undefined
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: BUCKET,
          ContinuationToken,
          MaxKeys: 1000,
        })
      )
      scan.pages++
      for (const o of page.Contents ?? []) {
        if (!o.Key) continue
        const size = o.Size ?? 0
        const t = o.LastModified?.getTime() ?? null
        objects++
        bytes += size
        seen.add(o.Key)

        let kind: Kind
        const ref = refs.get(o.Key)
        if (ref) kind = ref.kind
        else if (o.Key.startsWith("derived-audio/"))
          kind = liveFileIds.has(o.Key.split("/")[1] ?? "")
            ? "derivedAudio"
            : "orphan"
        else kind = "orphan"

        bump(byKind, kind, size)
        bump(byClass, o.StorageClass ?? "STANDARD", size)
        bump(byPrefix, o.Key.split("/")[0] ?? "", size)
        const sizeBucket = bySize[SIZE_BUCKETS.findIndex((b) => size < b.max)]
        sizeBucket.count++
        sizeBucket.bytes += size

        if (kind === "orphan") {
          orphanCount++
          orphanBytes += size
          if (orphanSample.length < SAMPLE)
            orphanSample.push({
              key: o.Key,
              size,
              lastModified: o.LastModified?.toISOString() ?? null,
            })
        }
        if (t !== null) {
          if (!oldest || t < oldest.t) oldest = { key: o.Key, t }
          if (!newest || t > newest.t) newest = { key: o.Key, t }
        }
        if (!largest || size > largest.size) largest = { key: o.Key, size }
      }
      scan.objects = objects
      ContinuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined
    } while (ContinuationToken)

    const missingByKind = new Map<Kind, number>()
    const missingSample: ScanResult["missing"]["sample"] = []
    let missingCount = 0
    for (const [key, ref] of refs) {
      if (seen.has(key)) continue
      missingCount++
      missingByKind.set(ref.kind, (missingByKind.get(ref.kind) ?? 0) + 1)
      if (missingSample.length < SAMPLE)
        missingSample.push({
          kind: ref.kind,
          key,
          fileId: ref.fileId,
          name: ref.name,
        })
    }

    const sorted = <K>(m: Map<K, { count: number; bytes: number }>) =>
      [...m.entries()].sort((a, b) => b[1].bytes - a[1].bytes)

    scan.result = {
      objects,
      bytes,
      byKind: sorted(byKind).map(([kind, v]) => ({ kind, ...v })),
      byStorageClass: sorted(byClass).map(([storageClass, v]) => ({
        storageClass,
        ...v,
      })),
      bySize,
      byTopPrefix: sorted(byPrefix)
        .slice(0, 15)
        .map(([prefix, v]) => ({ prefix, ...v })),
      oldestObject: oldest
        ? { key: oldest.key, at: new Date(oldest.t).toISOString() }
        : null,
      newestObject: newest
        ? { key: newest.key, at: new Date(newest.t).toISOString() }
        : null,
      largestObject: largest,
      orphans: { count: orphanCount, bytes: orphanBytes, sample: orphanSample },
      missing: {
        count: missingCount,
        byKind: [...missingByKind.entries()].map(([kind, count]) => ({
          kind,
          count,
        })),
        sample: missingSample,
      },
      dbBytesOnS3: n(dbBytes[0]?.bytes),
    }
  } catch (err) {
    scan.error = (err as Error)?.message ?? String(err)
    console.error("[s3] bucket scan failed", err)
  } finally {
    scan.running = false
    scan.finishedAt = new Date().toISOString()
  }
}
