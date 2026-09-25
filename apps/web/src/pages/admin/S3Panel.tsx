import { useEffect, useState } from "react"
import {
  CloudArrowUpIcon,
  CheckCircleIcon,
  XCircleIcon,
  WarningIcon,
  ArrowClockwiseIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Progress } from "@workspace/ui/components/progress"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@workspace/ui/components/table"
import { apiGet, apiJson } from "@/lib/api"
import { formatBytes, formatDate, relativeTime } from "@/lib/format"

// --- API shapes (mirror apps/api/src/lib/s3Analytics.ts) -------------------

type Backend = "s3" | "local" | "legacy"
type FileState = "live" | "trash" | "recycle"
type Kind =
  | "file"
  | "version"
  | "thumbnail"
  | "storyboard"
  | "folderThumbnail"
  | "spaceLogo"
  | "derivedAudio"
  | "orphan"

type Overview = {
  configured: boolean
  activeDriver: "local" | "s3"
  db: {
    files: Array<{
      backend: Backend
      state: FileState
      count: number
      bytes: number
    }>
    versions: Array<{ backend: Backend; count: number; bytes: number }>
    daily: Array<{ day: string; count: number; bytes: number }>
    categories: Array<{ category: string; count: number; bytes: number }>
    mimeTypes: Array<{ mimeType: string; count: number; bytes: number }>
    topOwners: Array<{
      id: string
      name: string
      email: string
      count: number
      bytes: number
    }>
    largest: Array<{
      id: string
      name: string
      size: number
      mimeType: string
      createdAt: string
      state: FileState
      owner: string
    }>
    firstUploadAt: string | null
    lastUploadAt: string | null
    derivatives: {
      thumbnails: number
      storyboards: number
      folderThumbnails: number
      spaceLogos: number
    }
  }
  live: null | {
    config: {
      endpoint: string
      region: string
      bucket: string
      forcePathStyle: boolean
      accessKeyId: string
    }
    connectivity: {
      reachable: boolean
      latencyMs: number | null
      error: string | null
      checkedAt: string
    }
    versioning: string
    metrics: {
      since: string
      ops: Array<{
        op: string
        count: number
        errors: number
        notFound: number
        avgMs: number
        maxMs: number
        bytes: number
        lastError: string | null
        lastAt: string | null
      }>
    }
    cache: {
      dir: string
      files: number
      bytes: number
      oldestAt: string | null
    }
  }
}

type Scan = {
  running: boolean
  startedAt: string | null
  finishedAt: string | null
  pages: number
  objects: number
  error: string | null
  result: null | {
    objects: number
    bytes: number
    byKind: Array<{ kind: Kind; count: number; bytes: number }>
    byStorageClass: Array<{
      storageClass: string
      count: number
      bytes: number
    }>
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
}

const KIND_LABEL: Record<Kind, string> = {
  file: "Files",
  version: "Old versions",
  thumbnail: "Thumbnails",
  storyboard: "Seek-bar previews",
  folderThumbnail: "Folder covers",
  spaceLogo: "Space logos",
  derivedAudio: "Audio-track remuxes",
  orphan: "Orphans (nothing references them)",
}

const BACKEND_LABEL: Record<Backend, string> = {
  s3: "S3 bucket",
  local: "Local disk",
  legacy: "Local disk (pre-S3 uploads)",
}

// --- small building blocks --------------------------------------------------

function sum<T>(rows: T[], f: (r: T) => number) {
  return rows.reduce((a, r) => a + f(r), 0)
}

function pct(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-0.5 py-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </CardContent>
    </Card>
  )
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`truncate text-sm font-medium ${mono ? "font-mono" : ""}`}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

// One-series magnitude list: label + value in text ink, a thin single-hue
// bar underneath scaled to the largest row. Identity is carried by the text
// label, never by color.
function BarList({
  rows,
  empty = "Nothing yet.",
}: {
  rows: Array<{ label: string; bytes: number; count: number }>
  empty?: string
}) {
  if (rows.length === 0)
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">{empty}</p>
    )
  const max = Math.max(1, ...rows.map((r) => r.bytes))
  const total = sum(rows, (r) => r.bytes)
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li
          key={r.label}
          title={`${r.label}: ${r.count.toLocaleString()} object${r.count === 1 ? "" : "s"} · ${formatBytes(r.bytes)} (${pct(r.bytes, total).toFixed(1)}%)`}
        >
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {r.count.toLocaleString()} · {formatBytes(r.bytes)}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${(r.bytes / max) * 100}%`,
                minWidth: r.bytes > 0 ? 4 : 0,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? "secondary" : "destructive"}>
      {ok ? <CheckCircleIcon size={12} /> : <XCircleIcon size={12} />}
      {label}
    </Badge>
  )
}

// --- sections ---------------------------------------------------------------

function ConnectionCard({
  o,
  onRefresh,
  loading,
}: {
  o: Overview
  onRefresh: () => void
  loading: boolean
}) {
  const live = o.live
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <CloudArrowUpIcon size={16} />
            S3 bucket
          </CardTitle>
          <div className="flex items-center gap-2">
            {!o.configured ? (
              <StatusBadge ok={false} label="Not configured" />
            ) : live?.connectivity.reachable ? (
              <StatusBadge
                ok
                label={`Connected · ${live.connectivity.latencyMs} ms`}
              />
            ) : (
              <StatusBadge ok={false} label="Unreachable" />
            )}
            <Badge variant="outline">
              New uploads → {o.activeDriver === "s3" ? "S3" : "local disk"}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={onRefresh}
              disabled={loading}
            >
              <ArrowClockwiseIcon size={14} />
              Refresh
            </Button>
          </div>
        </div>
        <CardDescription>
          {!o.configured
            ? "Set S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY in the API's .env and restart. Everything below still reflects what the database knows."
            : live?.connectivity.error
              ? `Last check failed: ${live.connectivity.error}`
              : `Checked ${relativeTime(live!.connectivity.checkedAt)}`}
        </CardDescription>
      </CardHeader>
      {live && (
        <CardContent>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-3 xl:grid-cols-6">
            <Meta label="Endpoint" value={live.config.endpoint} mono />
            <Meta label="Bucket" value={live.config.bucket} mono />
            <Meta label="Region" value={live.config.region} mono />
            <Meta
              label="Addressing"
              value={
                live.config.forcePathStyle ? "Path-style" : "Virtual-hosted"
              }
            />
            <Meta label="Access key" value={live.config.accessKeyId} mono />
            <Meta label="Bucket versioning" value={live.versioning} />
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function Tiles({ o }: { o: Overview }) {
  const s3 = o.db.files.filter((f) => f.backend === "s3")
  const live = s3.filter((f) => f.state === "live")
  const binned = s3.filter((f) => f.state !== "live")
  const allBytes = sum(o.db.files, (f) => f.bytes)
  const s3Bytes = sum(s3, (f) => f.bytes)
  const s3Count = sum(s3, (f) => f.count)
  const versions = o.db.versions.find((v) => v.backend === "s3")
  const d = o.db.derivatives
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Stat
        label="Files on S3"
        value={sum(live, (f) => f.count).toLocaleString()}
        sub={`${formatBytes(sum(live, (f) => f.bytes))} in use`}
      />
      <Stat
        label="Total on S3 (per DB)"
        value={formatBytes(s3Bytes)}
        sub={`${pct(s3Bytes, allBytes).toFixed(1)}% of all stored bytes`}
      />
      <Stat
        label="Trash + recycle bin"
        value={formatBytes(sum(binned, (f) => f.bytes))}
        sub={`${sum(binned, (f) => f.count).toLocaleString()} files — still billed until purged`}
      />
      <Stat
        label="Average file size"
        value={s3Count ? formatBytes(s3Bytes / s3Count) : "—"}
        sub={`${s3Count.toLocaleString()} files incl. bin`}
      />
      <Stat
        label="Old versions on S3"
        value={(versions?.count ?? 0).toLocaleString()}
        sub={formatBytes(versions?.bytes ?? 0)}
      />
      <Stat
        label="Generated assets on S3"
        value={(
          d.thumbnails +
          d.storyboards +
          d.folderThumbnails +
          d.spaceLogos
        ).toLocaleString()}
        sub={`${d.thumbnails} thumbs · ${d.storyboards} previews · ${d.folderThumbnails + d.spaceLogos} covers/logos`}
      />
    </div>
  )
}

function BackendSplit({ o }: { o: Overview }) {
  const byBackend = (["s3", "local", "legacy"] as Backend[]).map((b) => {
    const rows = o.db.files.filter((f) => f.backend === b)
    return {
      label: BACKEND_LABEL[b],
      count: sum(rows, (r) => r.count),
      bytes: sum(rows, (r) => r.bytes),
    }
  })
  const s3States = (["live", "trash", "recycle"] as FileState[]).map((s) => {
    const r = o.db.files.find((f) => f.backend === "s3" && f.state === s)
    return {
      label:
        s === "live"
          ? "Live"
          : s === "trash"
            ? "In users' trash"
            : "Admin recycle bin",
      count: r?.count ?? 0,
      bytes: r?.bytes ?? 0,
    }
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Where files live</CardTitle>
        <CardDescription>
          Every file row, by the backend its storage key points at.
          {o.db.firstUploadAt &&
            ` First S3 upload ${formatDate(o.db.firstUploadAt)}, latest ${relativeTime(o.db.lastUploadAt!)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <BarList rows={byBackend.filter((r) => r.count > 0)} />
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            S3 files by state
          </div>
          <BarList rows={s3States} />
        </div>
      </CardContent>
    </Card>
  )
}

function DailyChart({ o }: { o: Overview }) {
  const days = o.db.daily
  const max = Math.max(1, ...days.map((d) => d.bytes))
  const total = sum(days, (d) => d.bytes)
  const count = sum(days, (d) => d.count)
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Uploaded to S3 · last 30 days (UTC)</CardTitle>
          <CardDescription className="tabular-nums">
            {count.toLocaleString()} files · {formatBytes(total)}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <p className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            No uploads to S3 in the last 30 days.
          </p>
        ) : (
          <>
            <div className="flex h-32 items-end gap-0.5 border-b">
              {days.map((d) => (
                <div
                  key={d.day}
                  className="group flex h-full flex-1 items-end"
                  title={`${d.day}: ${d.count.toLocaleString()} file${d.count === 1 ? "" : "s"} · ${formatBytes(d.bytes)}`}
                >
                  <div
                    className="w-full rounded-t bg-primary group-hover:bg-primary/70"
                    style={{
                      height: `${(d.bytes / max) * 100}%`,
                      minHeight: d.bytes > 0 ? 2 : 0,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-0.5">
              {days.map((d, i) => (
                <div
                  key={d.day}
                  className="flex flex-1 justify-center overflow-visible"
                >
                  {(i % 5 === 0 || i === days.length - 1) && (
                    <span className="text-[10px] whitespace-nowrap text-muted-foreground">
                      {d.day.slice(5)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ContentMix({ o }: { o: Overview }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>S3 by file type</CardTitle>
        </CardHeader>
        <CardContent>
          <BarList
            rows={o.db.categories.map((c) => ({
              label: c.category,
              count: c.count,
              bytes: c.bytes,
            }))}
            empty="No files on S3 yet."
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Top MIME types on S3</CardTitle>
        </CardHeader>
        <CardContent>
          <BarList
            rows={o.db.mimeTypes.map((m) => ({
              label: m.mimeType,
              count: m.count,
              bytes: m.bytes,
            }))}
            empty="No files on S3 yet."
          />
        </CardContent>
      </Card>
    </div>
  )
}

function PeopleAndFiles({ o }: { o: Overview }) {
  const s3Total = sum(
    o.db.files.filter((f) => f.backend === "s3"),
    (f) => f.bytes
  )
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Top users on S3</CardTitle>
        </CardHeader>
        <CardContent>
          {o.db.topOwners.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No files on S3 yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Files</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.db.topOwners.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.email}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBytes(u.bytes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(u.bytes, s3Total).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Largest files on S3</CardTitle>
        </CardHeader>
        <CardContent>
          {o.db.largest.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No files on S3 yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.db.largest.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="max-w-[16rem]">
                      <div
                        className="truncate text-sm font-medium"
                        title={f.name}
                      >
                        {f.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {f.mimeType} · {relativeTime(f.createdAt)}
                        {f.state !== "live" &&
                          ` · ${f.state === "trash" ? "in trash" : "in recycle bin"}`}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{f.owner}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBytes(f.size)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RuntimeCard({ live }: { live: NonNullable<Overview["live"]> }) {
  const ops = live.metrics.ops
  const totalReq = sum(ops, (o) => o.count)
  const totalErr = sum(ops, (o) => o.errors)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>S3 requests from this server</CardTitle>
          <CardDescription>
            Since the API process started {relativeTime(live.metrics.since)} ·{" "}
            {totalReq.toLocaleString()} requests · {totalErr.toLocaleString()}{" "}
            errors. Resets on restart.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ops.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No S3 requests yet this run.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operation</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead className="text-right">404s</TableHead>
                  <TableHead className="text-right">Avg / max</TableHead>
                  <TableHead className="text-right">Bytes</TableHead>
                  <TableHead className="text-right">Last</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ops.map((o) => (
                  <TableRow key={o.op}>
                    <TableCell className="font-mono text-xs">{o.op}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.count.toLocaleString()}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${o.errors ? "text-destructive" : ""}`}
                      title={o.lastError ?? undefined}
                    >
                      {o.errors.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.notFound.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.avgMs} / {o.maxMs} ms
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.bytes ? formatBytes(o.bytes) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {o.lastAt ? relativeTime(o.lastAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {ops.some((o) => o.lastError) && (
            <p className="mt-3 text-xs text-destructive">
              Most recent error: {ops.find((o) => o.lastError)!.lastError}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Local download cache</CardTitle>
          <CardDescription>
            Temporary copies pulled from S3 for ffmpeg, unzip and image
            sniffing. Normally near-empty — a growing pile means cleanups are
            being missed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-semibold tabular-nums">
              {formatBytes(live.cache.bytes)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {live.cache.files.toLocaleString()} file
              {live.cache.files === 1 ? "" : "s"}
            </span>
          </div>
          {live.cache.oldestAt && (
            <span className="text-xs text-muted-foreground">
              Oldest: {relativeTime(live.cache.oldestAt)}
            </span>
          )}
          <span
            className="truncate font-mono text-xs text-muted-foreground"
            title={live.cache.dir}
          >
            {live.cache.dir}
          </span>
        </CardContent>
      </Card>
    </div>
  )
}

function ScanCard({ configured }: { configured: boolean }) {
  const [scan, setScan] = useState<Scan | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function fetchScan() {
      try {
        const s = await apiGet<Scan>("/api/admin/s3/scan")
        if (!cancelled) setScan(s)
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "failed")
      }
    }
    void fetchScan()
    return () => {
      cancelled = true
    }
  }, [tick])

  // Poll only while a scan is running so the object counter moves.
  const running = scan?.running ?? false
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setTick((x) => x + 1), 2000)
    return () => clearInterval(t)
  }, [running])

  async function start() {
    setErr(null)
    try {
      await apiJson("/api/admin/s3/scan", "POST")
      setTick((x) => x + 1)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed")
    }
  }

  const r = scan?.result
  const drift = r ? r.bytes - r.dbBytesOnS3 : 0

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <MagnifyingGlassIcon size={16} />
            Bucket audit
          </CardTitle>
          <Button
            size="sm"
            onClick={() => void start()}
            disabled={!configured || running}
          >
            {running
              ? `Scanning… ${scan!.objects.toLocaleString()} objects`
              : r
                ? "Re-scan bucket"
                : "Scan bucket"}
          </Button>
        </div>
        <CardDescription>
          Lists every object in the bucket and checks it against the database:
          what each object is, files the database points at that are missing
          from the bucket, and objects nothing points at.
          {scan?.finishedAt &&
            !running &&
            ` Last run ${relativeTime(scan.finishedAt)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!configured && (
          <p className="text-xs text-muted-foreground">
            Needs S3 to be configured.
          </p>
        )}
        {(err || scan?.error) && (
          <p className="text-xs text-destructive">{err ?? scan?.error}</p>
        )}
        {running && <Progress value={null} />}

        {r && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat
                label="Objects in bucket"
                value={r.objects.toLocaleString()}
                sub={formatBytes(r.bytes)}
              />
              <Stat
                label="Bucket vs database"
                value={`${drift >= 0 ? "+" : "−"}${formatBytes(Math.abs(drift))}`}
                sub={`DB expects ${formatBytes(r.dbBytesOnS3)} of file data; the rest is versions, previews and orphans`}
              />
              <Stat
                label="Missing from bucket"
                value={r.missing.count.toLocaleString()}
                sub={
                  r.missing.count
                    ? "Broken — these won't open"
                    : "Every reference resolves"
                }
              />
              <Stat
                label="Orphaned objects"
                value={r.orphans.count.toLocaleString()}
                sub={`${formatBytes(r.orphans.bytes)} billed for nothing`}
              />
            </div>

            {r.missing.count > 0 && (
              <div className="rounded-lg border border-destructive/40 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <WarningIcon size={14} />
                  {r.missing.count.toLocaleString()} referenced object
                  {r.missing.count === 1 ? "" : "s"} missing from the bucket
                  <span className="font-normal text-muted-foreground">
                    (
                    {r.missing.byKind
                      .map(
                        (k) => `${k.count} ${KIND_LABEL[k.kind].toLowerCase()}`
                      )
                      .join(", ")}
                    )
                  </span>
                </div>
                <ul className="flex flex-col gap-1 text-xs">
                  {r.missing.sample.map((m) => (
                    <li key={m.key} className="flex justify-between gap-2">
                      <span className="truncate">
                        {KIND_LABEL[m.kind]} · {m.name ?? "—"}
                      </span>
                      <span className="shrink-0 font-mono text-muted-foreground">
                        {m.key}
                      </span>
                    </li>
                  ))}
                </ul>
                {r.missing.count > r.missing.sample.length && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Showing {r.missing.sample.length} of{" "}
                    {r.missing.count.toLocaleString()}.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  What's in the bucket
                </div>
                <BarList
                  rows={r.byKind.map((k) => ({
                    label: KIND_LABEL[k.kind],
                    count: k.count,
                    bytes: k.bytes,
                  }))}
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Object size distribution
                </div>
                <BarList rows={r.bySize} />
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Storage class
                </div>
                <BarList
                  rows={r.byStorageClass.map((c) => ({
                    label: c.storageClass,
                    count: c.count,
                    bytes: c.bytes,
                  }))}
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Top-level prefixes
                </div>
                <BarList
                  rows={r.byTopPrefix.map((p) => ({
                    label: `${p.prefix}/`,
                    count: p.count,
                    bytes: p.bytes,
                  }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-3">
              <Meta
                label="Oldest object"
                value={
                  r.oldestObject
                    ? `${formatDate(r.oldestObject.at)} · ${r.oldestObject.key}`
                    : "—"
                }
              />
              <Meta
                label="Newest object"
                value={
                  r.newestObject
                    ? `${formatDate(r.newestObject.at)} · ${r.newestObject.key}`
                    : "—"
                }
              />
              <Meta
                label="Largest object"
                value={
                  r.largestObject
                    ? `${formatBytes(r.largestObject.size)} · ${r.largestObject.key}`
                    : "—"
                }
              />
            </div>

            {r.orphans.count > 0 && (
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Orphaned objects (showing {r.orphans.sample.length} of{" "}
                  {r.orphans.count.toLocaleString()})
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="text-right">
                        Last modified
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.orphans.sample.map((o) => (
                      <TableRow key={o.key}>
                        <TableCell
                          className="max-w-[24rem] truncate font-mono text-xs"
                          title={o.key}
                        >
                          {o.key}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBytes(o.size)}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {o.lastModified ? formatDate(o.lastModified) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// --- page -------------------------------------------------------------------

export function S3Panel() {
  const [o, setO] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function fetchOverview() {
      try {
        const v = await apiGet<Overview>("/api/admin/s3")
        if (!cancelled) {
          setO(v)
          setErr(null)
        }
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "failed")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchOverview()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  function refresh() {
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  if (err) return <div className="text-sm text-destructive">{err}</div>
  if (!o)
    return (
      <div className="text-sm text-muted-foreground">Loading S3 analytics…</div>
    )

  return (
    <div className="flex flex-col gap-4">
      <ConnectionCard o={o} onRefresh={refresh} loading={loading} />
      <Tiles o={o} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <BackendSplit o={o} />
        <DailyChart o={o} />
      </div>
      <ContentMix o={o} />
      <PeopleAndFiles o={o} />
      {o.live && <RuntimeCard live={o.live} />}
      <ScanCard configured={o.configured} />
    </div>
  )
}
