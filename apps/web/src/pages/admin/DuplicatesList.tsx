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
          Grouped by filename + size. Not a content hash, so false positives are possible.
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-0">
        {stats.files.duplicates.length === 0 ? (
          <div className="text-muted-foreground py-6 text-center text-xs">
            No duplicates detected.
          </div>
        ) : (
          <ul className="flex flex-col divide-y">
            {stats.files.duplicates.map((d, i) => (
              <li
                key={`${d.name}-${d.size}-${i}`}
                className="flex items-center gap-2 py-1.5 text-sm"
              >
                <span className="truncate flex-1" title={d.name}>
                  {d.name}
                </span>
                <Badge variant="destructive">×{d.count}</Badge>
                <span className="text-muted-foreground text-xs">
                  {formatBytes(d.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
