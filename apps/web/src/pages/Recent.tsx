import { useEffect, useMemo, useState } from "react"
import { useMe } from "@/store/me"
import { Sidebar } from "@/components/Sidebar"
import { FilePreview } from "@/components/FilePreview"
import { formatBytes, formatDate } from "@/lib/format"
import { apiUrl } from "@/lib/config"
import type { FileItem, RecentFile } from "@/lib/types"
import {
  FileIcon,
  ImageIcon,
  FileVideoIcon,
  FileTextIcon,
  SquaresFourIcon,
  ListBulletsIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { iconFor } from "@/lib/fileIcon"

type Bucket = { key: string; label: string; order: number }

type TypeFilter = "all" | "image" | "video" | "doc" | "other"

const DOC_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
]

function fileType(mime: string, name: string): Exclude<TypeFilter, "all"> {
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("text/")) return "doc"
  if (DOC_MIMES.includes(mime)) return "doc"
  if (mime.includes("officedocument") || /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|md|txt)$/i.test(name))
    return "doc"
  return "other"
}

function bucketFor(iso: string): Bucket {
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.floor((today.getTime() - day.getTime()) / 86400000)

  if (diffDays <= 0) return { key: "today", label: "Today", order: 0 }
  if (diffDays === 1) return { key: "yesterday", label: "Yesterday", order: 1 }
  if (diffDays < 7) return { key: "this-week", label: "Earlier this week", order: 2 }
  if (diffDays < 14) return { key: "last-week", label: "Last week", order: 3 }

  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
    return { key: "this-month", label: "Earlier this month", order: 4 }
  }
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  if (d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth()) {
    return { key: "last-month", label: "Last month", order: 5 }
  }
  const label = d.toLocaleString(undefined, { month: "long", year: "numeric" })
  const key = `${d.getFullYear()}-${d.getMonth()}`
  const order =
    6 + (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
  return { key, label, order }
}

export function RecentPage() {
  const { recent, loadRecent } = useMe()
  const [preview, setPreview] = useState<FileItem | null>(null)
  const [view, setView] = useState<"grid" | "list">("grid")
  const [filter, setFilter] = useState<TypeFilter>("all")

  useEffect(() => {
    void loadRecent(100)
  }, [loadRecent])

  const filtered = useMemo(
    () =>
      filter === "all"
        ? recent
        : recent.filter((f) => fileType(f.mimeType, f.name) === filter),
    [recent, filter]
  )

  const grouped = useMemo(() => {
    const map = new Map<string, { bucket: Bucket; files: RecentFile[] }>()
    for (const f of filtered) {
      const b = bucketFor(f.accessedAt)
      if (!map.has(b.key)) map.set(b.key, { bucket: b, files: [] })
      map.get(b.key)!.files.push(f)
    }
    return Array.from(map.values()).sort((a, b) => a.bucket.order - b.bucket.order)
  }, [filtered])

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="text-sm font-semibold">Recent</div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={view === "list" ? "default" : "ghost"}
              onClick={() => setView("list")}
              title="List view"
            >
              <ListBulletsIcon size={16} />
            </Button>
            <Button
              size="sm"
              variant={view === "grid" ? "default" : "ghost"}
              onClick={() => setView("grid")}
              title="Grid view"
            >
              <SquaresFourIcon size={16} />
            </Button>
          </div>
        </header>
        <div className="flex items-center gap-2 border-b px-6 py-3">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </FilterChip>
          <FilterChip active={filter === "image"} onClick={() => setFilter("image")}>
            <ImageIcon size={14} /> Images
          </FilterChip>
          <FilterChip active={filter === "video"} onClick={() => setFilter("video")}>
            <FileVideoIcon size={14} /> Videos
          </FilterChip>
          <FilterChip active={filter === "doc"} onClick={() => setFilter("doc")}>
            <FileTextIcon size={14} /> Docs
          </FilterChip>
          <FilterChip active={filter === "other"} onClick={() => setFilter("other")}>
            <FileIcon size={14} /> Other
          </FilterChip>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5">
          {grouped.length === 0 ? (
            <div className="text-muted-foreground py-20 text-center text-sm">
              Nothing here yet. Files you open will show up here.
            </div>
          ) : (
            grouped.map(({ bucket, files }) => (
              <section key={bucket.key} className="mb-8">
                <h2 className="text-muted-foreground mb-3 text-sm font-medium">
                  {bucket.label}
                </h2>
                {view === "grid" ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                    {files.map((f) => (
                      <RecentCard key={f.id} file={f} onOpen={() => setPreview(f)} />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="text-muted-foreground border-b text-xs uppercase">
                        <tr>
                          <th className="py-2 pl-3 text-left font-medium">Name</th>
                          <th className="py-2 text-left font-medium">Action</th>
                          <th className="py-2 text-left font-medium">Accessed</th>
                          <th className="py-2 pr-3 text-left font-medium">Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {files.map((f) => (
                          <tr
                            key={f.id}
                            className="hover:bg-accent/40 cursor-pointer border-b last:border-b-0"
                            onClick={() => setPreview(f)}
                            onDoubleClick={() => setPreview(f)}
                          >
                            <td className="py-2 pl-3">
                              <div className="flex items-center gap-2">
                                {iconFor(f.mimeType, 18, f.name)}
                                <span className="truncate">{f.name}</span>
                              </div>
                            </td>
                            <td className="py-2 capitalize">{f.action}</td>
                            <td className="py-2">{formatDate(f.accessedAt)}</td>
                            <td className="py-2 pr-3">{formatBytes(f.size)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))
          )}
        </div>
        <FilePreview file={preview} onClose={() => setPreview(null)} />
      </main>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "hover:bg-accent text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

function RecentCard({
  file,
  onOpen,
}: {
  file: RecentFile
  onOpen: () => void
}) {
  const isImg = file.mimeType.startsWith("image/")
  return (
    <button
      onClick={onOpen}
      onDoubleClick={onOpen}
      className="bg-card hover:border-primary/60 flex flex-col overflow-hidden rounded-lg border text-left transition-colors"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {iconFor(file.mimeType, 16, file.name)}
        <span className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </span>
      </div>
      <div className="bg-muted aspect-4/3 overflow-hidden border-t">
        {isImg ? (
          <img
            src={apiUrl(`/api/files/${file.id}/download?inline=1`)}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center">
            {iconFor(file.mimeType, 56, file.name)}
          </div>
        )}
      </div>
      <div className="text-muted-foreground flex items-center justify-between px-3 py-1.5 text-xs">
        <span className="capitalize">{file.action}</span>
        <span>{formatBytes(file.size)}</span>
      </div>
    </button>
  )
}
