import { useDrive } from "@/store/drive"

const ERROR_COPY: Record<string, string> = {
  quota_exceeded: "Out of storage — request an upgrade from the sidebar.",
  too_large: "File exceeds the per-file size limit.",
  forbidden: "You don't have permission to upload here.",
  network_error: "Network error. Check your connection and try again.",
  invalid_url: "That doesn't look like a valid URL.",
  url_not_allowed: "That URL can't be used (blocked for security reasons).",
  fetch_failed: "Couldn't download from that URL.",
  too_many_imports: "Too many imports already running — try again shortly.",
  not_a_zip: "That file isn't a zip archive.",
  invalid_zip: "Couldn't read that zip file.",
  too_many_entries: "Archive has too many files to extract.",
  gone: "The zip file is missing from storage.",
}

function humanize(err: string) {
  return ERROR_COPY[err] ?? err
}

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  const digits = v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2
  return `${v.toFixed(digits)} ${units[i]}`
}

function formatSpeed(bps: number) {
  if (!Number.isFinite(bps) || bps <= 0) return "—"
  return `${formatBytes(bps)}/s`
}

export function UploadToaster() {
  const uploads = useDrive((s) => s.uploads)
  if (uploads.length === 0) return null
  return (
    <div className="fixed right-4 bottom-4 z-50 w-80 space-y-2">
      {uploads.map((u) => {
        const pct = Math.min(100, Math.max(0, u.progress))
        return (
          <div key={u.id} className="bg-card rounded-lg border p-3 shadow-lg">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium">{u.name}</span>
              <span className="text-muted-foreground shrink-0">
                {Math.round(pct)}%
              </span>
            </div>
            <div className="bg-muted mb-1.5 h-1.5 w-full overflow-hidden rounded-full">
              {u.indeterminate && !u.done ? (
                <div className="bg-primary/60 h-full w-1/3 animate-pulse rounded-full" />
              ) : (
                <div
                  className={`h-full transition-all ${
                    u.error ? "bg-destructive" : "bg-primary"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              )}
            </div>
            <div className="text-muted-foreground flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate">
                {u.unit === "files"
                  ? u.indeterminate
                    ? "Starting…"
                    : `${u.loaded} / ${u.size} files`
                  : u.indeterminate
                    ? u.done
                      ? formatBytes(u.loaded)
                      : u.loaded > 0
                        ? `${formatBytes(u.loaded)} downloaded`
                        : "Starting…"
                    : `${formatBytes(u.loaded)} / ${formatBytes(u.size)}`}
              </span>
              <span className="shrink-0">
                {u.done
                  ? u.error
                    ? "failed"
                    : "done"
                  : u.unit === "files"
                    ? "extracting…"
                    : formatSpeed(u.speed)}
              </span>
            </div>
            {u.error && (
              <div className="text-destructive mt-1 text-xs">
                {humanize(u.error)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
