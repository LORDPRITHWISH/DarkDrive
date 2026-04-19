import { useEffect, useState } from "react"
import {
  CpuIcon,
  HardDrivesIcon,
  MemoryIcon,
  DatabaseIcon,
} from "@phosphor-icons/react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { Badge } from "@workspace/ui/components/badge"
import { apiGet } from "@/lib/api"
import { formatBytes } from "@/lib/format"
import type { ServerStats } from "@/lib/types"

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

function barClass(pct: number) {
  if (pct >= 90) return "bg-destructive"
  if (pct >= 70) return "bg-amber-500"
  return undefined
}

export function ServerPanel() {
  const [data, setData] = useState<ServerStats | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const s = await apiGet<ServerStats>("/api/admin/server-stats")
        if (!cancelled) {
          setData(s)
          setErr(null)
        }
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "failed")
      }
    }
    void load()
    const t = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  if (err)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Server</CardTitle>
          <CardDescription className="text-destructive">{err}</CardDescription>
        </CardHeader>
      </Card>
    )
  if (!data)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Server</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    )

  const cacheTotal = data.redis
    ? data.redis.hits + data.redis.misses
    : 0
  const hitRate = cacheTotal > 0 ? (data.redis!.hits / cacheTotal) * 100 : null

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CpuIcon size={16} />
              CPU
            </CardTitle>
            <Badge variant="muted">{data.cpu.cores} cores</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-semibold tabular-nums">
              {data.cpu.usagePct.toFixed(1)}%
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              load {data.cpu.load1.toFixed(2)} · {data.cpu.load5.toFixed(2)} ·{" "}
              {data.cpu.load15.toFixed(2)}
            </span>
          </div>
          <Progress
            value={data.cpu.usagePct}
            indicatorClassName={barClass(data.cpu.usagePct)}
          />
          <CardDescription className="truncate">{data.cpu.model}</CardDescription>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MemoryIcon size={16} />
            Memory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-semibold">
              {formatBytes(data.memory.used)}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              of {formatBytes(data.memory.total)}
            </span>
          </div>
          <Progress
            value={data.memory.pct}
            indicatorClassName={barClass(data.memory.pct)}
          />
          <CardDescription>
            Heap {formatBytes(data.process.heapUsed)} / RSS{" "}
            {formatBytes(data.process.rss)}
          </CardDescription>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrivesIcon size={16} />
            Disk (storage root)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.disk ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-semibold">
                  {formatBytes(data.disk.used)}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  of {formatBytes(data.disk.total)}
                </span>
              </div>
              <Progress
                value={data.disk.pct}
                indicatorClassName={barClass(data.disk.pct)}
              />
              <CardDescription>
                {formatBytes(data.disk.free)} free
              </CardDescription>
            </>
          ) : (
            <CardDescription>statfs unavailable</CardDescription>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseIcon size={16} />
            Redis cache
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.redis ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-semibold tabular-nums">
                  {hitRate !== null ? `${hitRate.toFixed(1)}%` : "—"}
                </span>
                <span className="text-muted-foreground text-xs">hit rate</span>
              </div>
              <Progress
                value={hitRate ?? 0}
                indicatorClassName={
                  hitRate !== null && hitRate < 50 ? "bg-amber-500" : undefined
                }
              />
              <CardDescription className="tabular-nums">
                {data.redis.hits.toLocaleString()} hits ·{" "}
                {data.redis.misses.toLocaleString()} misses ·{" "}
                {data.redis.evictedKeys.toLocaleString()} evicted
              </CardDescription>
            </>
          ) : (
            <CardDescription>unavailable</CardDescription>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2 xl:col-span-4">
        <CardHeader>
          <CardTitle>Host</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs md:grid-cols-4">
            <Meta label="Hostname" value={data.host.hostname} />
            <Meta label="Platform" value={`${data.host.platform} ${data.host.arch}`} />
            <Meta label="Kernel" value={data.host.release} />
            <Meta label="Node" value={data.host.node} />
            <Meta label="System uptime" value={formatDuration(data.host.uptimeSec)} />
            <Meta
              label="Process uptime"
              value={formatDuration(data.process.uptimeSec)}
            />
            <Meta label="PID" value={String(data.process.pid)} />
            <Meta
              label="CPU speed"
              value={data.cpu.speedMHz > 0 ? `${data.cpu.speedMHz} MHz` : "—"}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium" title={value}>
        {value}
      </span>
    </div>
  )
}
