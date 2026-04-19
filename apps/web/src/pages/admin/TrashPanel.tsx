import { TrashIcon } from "@phosphor-icons/react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { formatBytes } from "@/lib/format"
import type { AdminStats } from "@/lib/types"

export function TrashPanel({ stats }: { stats: AdminStats }) {
  const liveBytes = stats.storage.usedBytes
  const trashedBytes = stats.storage.trashedBytes
  const totalFootprint = liveBytes + trashedBytes
  const pct = totalFootprint > 0 ? (trashedBytes / totalFootprint) * 100 : 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrashIcon size={16} />
            Trash
          </CardTitle>
          <CardDescription>
            {stats.storage.trashedCount.toLocaleString()} file
            {stats.storage.trashedCount === 1 ? "" : "s"}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-xl font-semibold">
            {formatBytes(trashedBytes)}
          </span>
          <span className="text-muted-foreground text-xs">
            {pct.toFixed(1)}% of footprint
          </span>
        </div>
        <Progress
          value={pct}
          indicatorClassName={pct >= 20 ? "bg-amber-500" : undefined}
        />
        <CardDescription>
          {formatBytes(liveBytes)} live · reclaimable by permanent delete
        </CardDescription>
      </CardContent>
    </Card>
  )
}
