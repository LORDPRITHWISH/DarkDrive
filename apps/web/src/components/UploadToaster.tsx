import { useDrive } from "@/store/drive"

const ERROR_COPY: Record<string, string> = {
  quota_exceeded: "Out of storage — request an upgrade from the sidebar.",
  too_large: "File exceeds the per-file size limit.",
  forbidden: "You don't have permission to upload here.",
  network_error: "Network error. Check your connection and try again.",
}

function humanize(err: string) {
  return ERROR_COPY[err] ?? err
}

export function UploadToaster() {
  const uploads = useDrive((s) => s.uploads)
  if (uploads.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 space-y-2">
      {uploads.map((u) => (
        <div key={u.id} className="bg-card border rounded-lg p-3 shadow-lg">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="truncate font-medium">{u.name}</span>
            <span className="text-muted-foreground">{Math.round(u.progress)}%</span>
          </div>
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={`h-full transition-all ${
                u.error ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${u.progress}%` }}
            />
          </div>
          {u.error && (
            <div className="text-destructive mt-1 text-xs">{humanize(u.error)}</div>
          )}
        </div>
      ))}
    </div>
  )
}
