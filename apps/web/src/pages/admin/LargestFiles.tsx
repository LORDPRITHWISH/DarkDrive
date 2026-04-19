import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card"
import { formatBytes } from "@/lib/format"
import { iconFor } from "@/lib/fileIcon"
import type { AdminStats } from "@/lib/types"

export function LargestFiles({ stats }: { stats: AdminStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Largest files</CardTitle>
      </CardHeader>
      <CardContent className="gap-0">
        {stats.files.largest.length === 0 ? (
          <div className="text-muted-foreground py-6 text-center text-xs">
            None yet.
          </div>
        ) : (
          <ul className="flex flex-col divide-y">
            {stats.files.largest.map((f) => (
              <li key={f.id} className="flex items-center gap-2 py-1.5">
                {iconFor(f.mimeType, 16)}
                <span className="truncate text-sm" title={f.name}>
                  {f.name}
                </span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  {f.owner?.name ?? "?"} · {formatBytes(f.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
