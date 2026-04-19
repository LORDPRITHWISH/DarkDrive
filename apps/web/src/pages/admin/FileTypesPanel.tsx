import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card"
import { formatBytes } from "@/lib/format"
import type { AdminStats } from "@/lib/types"

const LABELS: Record<string, { label: string; color: string }> = {
  image: { label: "Images", color: "bg-emerald-500" },
  video: { label: "Videos", color: "bg-sky-500" },
  audio: { label: "Audio", color: "bg-violet-500" },
  doc: { label: "Documents", color: "bg-amber-500" },
  archive: { label: "Archives", color: "bg-rose-500" },
  other: { label: "Other", color: "bg-slate-500" },
}

export function FileTypesPanel({ stats }: { stats: AdminStats }) {
  const entries = Object.entries(stats.files.byType) as [
    keyof typeof LABELS,
    number,
  ][]
  const totalBytes = Object.values(stats.files.bytesByType).reduce((a, b) => a + b, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>File types</CardTitle>
      </CardHeader>
      <CardContent>
        {totalBytes === 0 ? (
          <div className="text-muted-foreground py-6 text-center text-xs">
            No files uploaded yet.
          </div>
        ) : (
          <>
            <div className="bg-muted flex h-3 w-full overflow-hidden rounded-full">
              {entries.map(([k]) => {
                const bytes = stats.files.bytesByType[k] ?? 0
                const pct = (bytes / totalBytes) * 100
                if (pct === 0) return null
                return (
                  <div
                    key={k}
                    className={LABELS[k].color}
                    style={{ width: `${pct}%` }}
                    title={`${LABELS[k].label}: ${formatBytes(bytes)}`}
                  />
                )
              })}
            </div>
            <ul className="flex flex-col">
              {entries
                .sort(
                  (a, b) =>
                    (stats.files.bytesByType[b[0]] ?? 0) -
                    (stats.files.bytesByType[a[0]] ?? 0)
                )
                .map(([k, count]) => {
                  const bytes = stats.files.bytesByType[k] ?? 0
                  const pct = totalBytes > 0 ? (bytes / totalBytes) * 100 : 0
                  return (
                    <li
                      key={k}
                      className="grid grid-cols-[1rem_1fr_auto_auto] items-center gap-3 py-1.5 text-sm"
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${LABELS[k].color}`}
                      />
                      <span className="text-foreground">{LABELS[k].label}</span>
                      <span className="text-muted-foreground tabular-nums text-xs">
                        {count.toLocaleString()} file{count === 1 ? "" : "s"}
                      </span>
                      <span className="tabular-nums text-xs font-medium w-20 text-right">
                        {formatBytes(bytes)}
                        <span className="text-muted-foreground ml-1 font-normal">
                          · {pct.toFixed(0)}%
                        </span>
                      </span>
                    </li>
                  )
                })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
