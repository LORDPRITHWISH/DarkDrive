import { CopyIcon } from "@phosphor-icons/react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { formatBytes } from "@/lib/format"
import type { AdminStats } from "@/lib/types"

export function DuplicatesList({ stats }: { stats: AdminStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Possible duplicates</CardTitle>
        <CardDescription>
          Grouped by filename + size. Not a content hash, so false positives are
          possible.
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-0">
        {stats.files.duplicates.length === 0 ? (
          <div className="text-muted-foreground py-6 text-center text-xs">
            No duplicates detected.
          </div>
        ) : (
          <ul className="flex flex-col divide-y">
            {stats.files.duplicates.map((d, i) => {
              const wasted = d.size * (d.count - 1)
              return (
                <li
                  key={`${d.name}-${d.size}-${i}`}
                  className="flex items-center gap-3 py-2"
                >
                  <span className="text-muted-foreground shrink-0">
                    <CopyIcon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" title={d.name}>
                      {d.name}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {formatBytes(d.size)} each · {formatBytes(wasted)} reclaimable
                    </div>
                  </div>
                  <Badge variant="destructive" className="shrink-0">
                    {d.count} copies
                  </Badge>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
