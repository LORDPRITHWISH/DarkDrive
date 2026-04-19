import { useEffect, useState } from "react"
import { CpuIcon, HardDrivesIcon, MemoryIcon } from "@phosphor-icons/react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { apiGet } from "@/lib/api"
import { formatBytes } from "@/lib/format"
import type { ServerStats } from "@/lib/types"

function barClass(pct: number) {
  if (pct >= 90) return "bg-destructive"
  if (pct >= 70) return "bg-amber-500"
  return undefined
}

export function ServerSummary() {
  const [data, setData] = useState<ServerStats | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const s = await apiGet<ServerStats>("/api/admin/server-stats")
        if (!cancelled) setData(s)
      } catch {
        // silent — detailed errors are surfaced in the Server tab
      }
    }
    void load()
    const t = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
            <CpuIcon size={16} />
            CPU
          </CardTitle>
        </CardHeader>
        <CardContent className="gap-2">
          {data ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">
                  {data.cpu.usagePct.toFixed(1)}%
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {data.cpu.cores} cores · load {data.cpu.load1.toFixed(2)}
                </span>
              </div>
              <Progress
                value={data.cpu.usagePct}
                indicatorClassName={barClass(data.cpu.usagePct)}
              />
              <CardDescription className="truncate">
                {data.cpu.model}
              </CardDescription>
            </>
          ) : (
            <Skeleton />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
            <MemoryIcon size={16} />
            RAM
          </CardTitle>
        </CardHeader>
        <CardContent className="gap-2">
          {data ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold">
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
                {data.memory.pct.toFixed(0)}% used · heap{" "}
                {formatBytes(data.process.heapUsed)}
              </CardDescription>
            </>
          ) : (
            <Skeleton />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
            <HardDrivesIcon size={16} />
            Disk
          </CardTitle>
        </CardHeader>
        <CardContent className="gap-2">
          {data && data.disk ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold">
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
                {formatBytes(data.disk.free)} free on storage volume
              </CardDescription>
            </>
          ) : data && !data.disk ? (
            <CardDescription>statfs unavailable on this host</CardDescription>
          ) : (
            <Skeleton />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Skeleton() {
  return (
    <>
      <div className="bg-muted h-7 w-24 animate-pulse rounded" />
      <div className="bg-muted h-1.5 w-full animate-pulse rounded-full" />
      <div className="bg-muted h-3 w-32 animate-pulse rounded" />
    </>
  )
}
