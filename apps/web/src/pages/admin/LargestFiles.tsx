import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card"
import { formatBytes } from "@/lib/format"
import { iconFor } from "@/lib/fileIcon"
import { FilePreview } from "@/components/FilePreview"
import { useAdminFilePreview } from "./useAdminFilePreview"
import type { AdminStats } from "@/lib/types"

export function LargestFiles({ stats }: { stats: AdminStats }) {
  const { preview, loadingId, open, close } = useAdminFilePreview()
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
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => open(f.id)}
                  disabled={loadingId === f.id}
                  className="hover:bg-accent/40 -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-2 text-left disabled:opacity-60"
                  title={`Open "${f.name}"`}
                >
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
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <FilePreview file={preview} onClose={close} />
    </Card>
  )
}
