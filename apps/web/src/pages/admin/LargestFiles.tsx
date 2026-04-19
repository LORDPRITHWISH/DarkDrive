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
            {stats.files.largest.map((f, i) => (
              <li key={f.id} className="flex items-center gap-3 py-2">
                <span className="text-muted-foreground w-5 shrink-0 text-center text-xs tabular-nums">
                  {i + 1}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {iconFor(f.mimeType, 18, f.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={f.name}>
                    {f.name}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {f.owner?.name ?? "Unknown owner"}
                  </div>
                </div>
                <span className="tabular-nums shrink-0 text-sm font-semibold">
                  {formatBytes(f.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
