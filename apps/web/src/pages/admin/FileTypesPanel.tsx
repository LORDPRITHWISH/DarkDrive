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
            <ul className="space-y-1.5 text-sm">
              {entries
                .sort(
                  (a, b) =>
                    (stats.files.bytesByType[b[0]] ?? 0) -
                    (stats.files.bytesByType[a[0]] ?? 0)
                )
                .map(([k, count]) => (
                  <li key={k} className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${LABELS[k].color}`} />
                    <span className="flex-1">{LABELS[k].label}</span>
                    <span className="text-muted-foreground text-xs">
                      {count} · {formatBytes(stats.files.bytesByType[k] ?? 0)}
                    </span>
                  </li>
                ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
