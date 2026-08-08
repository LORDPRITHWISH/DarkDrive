import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  DownloadIcon,
  FileArchiveIcon,
  FileAudioIcon,
  FileIcon,
  FileTextIcon,
  FileVideoIcon,
  FolderIcon,
  ImageIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  SquaresFourIcon,
  StarIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
import { FilePreview } from "@/components/FilePreview"
import { FileThumb } from "@/components/file-grid/FileThumb"
import { SearchFolderDialog } from "@/components/SearchFolderDialog"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { apiGet, apiJson } from "@/lib/api"
import { formatBytes, formatDate } from "@/lib/format"
import { triggerDownload } from "@/lib/download"
import { SEARCH_TYPE_LABELS } from "@/lib/fileType"
import type {
  FileItem,
  SearchFileResult,
  SearchFolderResult,
  SearchResponse,
  SearchTypeFilter,
} from "@/lib/types"

const TYPE_ORDER: SearchTypeFilter[] = [
  "all", "folder", "image", "video", "audio", "doc", "archive", "other",
]

const TYPE_ICONS: Record<SearchTypeFilter, React.ReactNode> = {
  all: null,
  folder: <FolderIcon size={14} />,
  image: <ImageIcon size={14} />,
  video: <FileVideoIcon size={14} />,
  audio: <FileAudioIcon size={14} />,
  doc: <FileTextIcon size={14} />,
  archive: <FileArchiveIcon size={14} />,
  other: <FileIcon size={14} />,
}

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()

  const urlQ = params.get("q") ?? ""
  const type = (params.get("type") as SearchTypeFilter | null) ?? "all"
  const folderId = params.get("folderId") || undefined

  const [qInput, setQInput] = useState(urlQ)
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<"grid" | "list">("grid")
  const [preview, setPreview] = useState<FileItem | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  // The URL is the committed query; the input can drift from it briefly
  // while the user types. Keep it in sync when the URL changes some other
  // way (back/forward nav, clearing a filter chip).
  useEffect(() => {
    setQInput(urlQ)
  }, [urlQ])

  function commitQuery(next: string) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next.trim()) p.set("q", next)
        else p.delete("q")
        return p
      },
      { replace: true }
    )
  }

  // Debounced so every keystroke doesn't rewrite the URL / refire the search.
  useEffect(() => {
    if (qInput === urlQ) return
    const t = setTimeout(() => commitQuery(qInput), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput])

  function setType(t: SearchTypeFilter) {
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      if (t === "all") p.delete("type")
      else p.set("type", t)
      return p
    })
  }

  function setFolderScope(id: string | null) {
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      if (id) p.set("folderId", id)
      else p.delete("folderId")
      return p
    })
  }

  const active = !!urlQ.trim() || type !== "all" || !!folderId

  useEffect(() => {
    if (!active) {
      setResult(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams()
    if (urlQ.trim()) qs.set("q", urlQ.trim())
    if (type !== "all") qs.set("type", type)
    if (folderId) qs.set("folderId", folderId)
    apiGet<SearchResponse>(`/api/search?${qs.toString()}`)
      .then((r) => {
        if (!cancelled) setResult(r)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "search_failed")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active, urlQ, type, folderId, reloadTick])

  async function toggleStar(kind: "file" | "folder", id: string, starred: boolean) {
    setResult((r) => {
      if (!r) return r
      return {
        ...r,
        files: kind === "file" ? r.files.map((f) => (f.id === id ? { ...f, isStarred: !starred } : f)) : r.files,
        folders:
          kind === "folder" ? r.folders.map((f) => (f.id === id ? { ...f, isStarred: !starred } : f)) : r.folders,
      }
    })
    try {
      await apiJson(`/api/${kind === "folder" ? "folders" : "files"}/${id}`, "PATCH", {
        isStarred: !starred,
      })
    } catch {
      // Revert on failure
      setResult((r) => {
        if (!r) return r
        return {
          ...r,
          files: kind === "file" ? r.files.map((f) => (f.id === id ? { ...f, isStarred: starred } : f)) : r.files,
          folders:
            kind === "folder" ? r.folders.map((f) => (f.id === id ? { ...f, isStarred: starred } : f)) : r.folders,
        }
      })
    }
  }

  const folders = result?.folders ?? []
  const files = result?.files ?? []
  const isEmpty = active && !loading && !error && folders.length === 0 && files.length === 0

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <SidebarToggle />
            <MagnifyingGlassIcon size={18} />
            <div className="text-sm font-semibold">Search</div>
          </div>
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
            <HeaderActions onReload={() => setReloadTick((t) => t + 1)} />
          </div>
        </header>

        <div className="border-b px-4 py-3 md:px-6">
          <div className="relative">
            <MagnifyingGlassIcon
              size={16}
              className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            />
            <input
              autoFocus
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitQuery(qInput)
              }}
              placeholder="Search files and folders by name…"
              className="bg-background focus-visible:ring-ring w-full rounded-xl border py-2 pl-9 pr-9 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
            {qInput && (
              <button
                onClick={() => {
                  setQInput("")
                  commitQuery("")
                }}
                className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2"
                aria-label="Clear search"
              >
                <XCircleIcon size={16} weight="fill" />
              </button>
            )}
          </div>
          <div className="text-muted-foreground mt-1.5 px-1 text-xs">
            Tip: use <code className="bg-muted rounded px-1">*</code> to match any text and{" "}
            <code className="bg-muted rounded px-1">?</code> for a single character — e.g.{" "}
            <code className="bg-muted rounded px-1">report-*.pdf</code>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto border-b px-4 py-3 md:px-6">
          {TYPE_ORDER.map((t) => (
            <FilterChip key={t} active={type === t} onClick={() => setType(t)}>
              {TYPE_ICONS[t]}
              {SEARCH_TYPE_LABELS[t]}
            </FilterChip>
          ))}
          <div className="bg-border mx-1 h-5 w-px shrink-0" />
          {folderId ? (
            <FilterChip active onClick={() => setPickerOpen(true)}>
              <MapPinIcon size={14} />
              In: {result?.scope?.name ?? "…"}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setFolderScope(null)
                }}
                className="ml-1 rounded-full hover:bg-black/10"
                aria-label="Search everywhere"
              >
                <XIcon size={12} />
              </button>
            </FilterChip>
          ) : (
            <FilterChip active={false} onClick={() => setPickerOpen(true)}>
              <MapPinIcon size={14} />
              All of Drive
            </FilterChip>
          )}
        </div>

        <div className="flex-1 overflow-auto px-4 py-5 md:px-6">
          {!active ? (
            <div className="text-muted-foreground py-20 text-center text-sm">
              Start typing, or pick a type/folder filter to browse your files.
            </div>
          ) : loading && !result ? (
            <div className="text-muted-foreground py-20 text-center text-sm">Searching…</div>
          ) : error ? (
            <div className="text-destructive py-20 text-center text-sm">{error}</div>
          ) : isEmpty ? (
            <div className="text-muted-foreground py-20 text-center text-sm">
              No matches{urlQ.trim() ? ` for "${urlQ.trim()}"` : ""}.
            </div>
          ) : view === "grid" ? (
            <div className="flex flex-col gap-8">
              {folders.length > 0 && (
                <section>
                  <h2 className="text-muted-foreground mb-3 text-sm font-medium">Folders</h2>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
                    {folders.map((f) => (
                      <FolderTile
                        key={f.id}
                        folder={f}
                        onOpen={() => nav(`/drive/${f.id}`)}
                        onOpenLocation={f.parentId ? () => nav(`/drive/${f.parentId}`) : undefined}
                        onToggleStar={() => toggleStar("folder", f.id, f.isStarred)}
                      />
                    ))}
                  </div>
                </section>
              )}
              {files.length > 0 && (
                <section>
                  <h2 className="text-muted-foreground mb-3 text-sm font-medium">Files</h2>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                    {files.map((f) => (
                      <FileTile
                        key={f.id}
                        file={f}
                        onOpen={() => setPreview(f)}
                        onOpenLocation={() => nav(`/drive/${f.folderId}`)}
                        onToggleStar={() => toggleStar("file", f.id, f.isStarred)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="p-0 py-2 pl-3">Name</TableHead>
                    <TableHead className="p-0 py-2">Location</TableHead>
                    <TableHead className="p-0 py-2">Modified</TableHead>
                    <TableHead className="p-0 py-2 pr-3">Size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {folders.map((f) => (
                    <TableRow
                      key={f.id}
                      className="cursor-pointer last:border-b-0"
                      onClick={() => nav(`/drive/${f.id}`)}
                    >
                      <TableCell className="p-0 py-2 pl-3">
                        <div className="flex items-center gap-2">
                          <FolderIcon
                            size={18}
                            weight="fill"
                            style={{ color: f.color || undefined }}
                            className={f.color ? "" : "text-primary"}
                          />
                          <span>{f.name}</span>
                          {f.isStarred && (
                            <StarIcon size={14} weight="fill" className="text-yellow-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground p-0 py-2 hover:underline"
                        onClick={(e) => {
                          if (!f.parentId) return
                          e.stopPropagation()
                          nav(`/drive/${f.parentId}`)
                        }}
                      >
                        {f.parentName ?? "My Drive"}
                      </TableCell>
                      <TableCell className="p-0 py-2">{formatDate(f.updatedAt)}</TableCell>
                      <TableCell className="p-0 py-2 pr-3">—</TableCell>
                    </TableRow>
                  ))}
                  {files.map((f) => (
                    <TableRow
                      key={f.id}
                      className="cursor-pointer last:border-b-0"
                      onClick={() => setPreview(f)}
                    >
                      <TableCell className="p-0 py-2 pl-3">
                        <div className="flex items-center gap-2">
                          {iconForRow(f)}
                          <span>{f.name}</span>
                          {f.isStarred && (
                            <StarIcon size={14} weight="fill" className="text-yellow-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground p-0 py-2 hover:underline"
                        onClick={(e) => {
                          e.stopPropagation()
                          nav(`/drive/${f.folderId}`)
                        }}
                      >
                        {f.folderName ?? "—"}
                      </TableCell>
                      <TableCell className="p-0 py-2">{formatDate(f.updatedAt)}</TableCell>
                      <TableCell className="p-0 py-2 pr-3">{formatBytes(f.size)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {result?.truncated && !isEmpty && (
            <div className="text-muted-foreground mt-4 text-center text-xs">
              Showing the first matches only — narrow your search to see more precise results.
            </div>
          )}
        </div>

        <FilePreview file={preview} onClose={() => setPreview(null)} items={files} onNavigate={setPreview} />
      </main>

      <SearchFolderDialog
        open={pickerOpen}
        initialFolderId={folderId ?? null}
        onClose={() => setPickerOpen(false)}
        onSubmit={setFolderScope}
      />
    </div>
  )
}

function iconForRow(file: SearchFileResult) {
  return (
    <span className="grid size-5 shrink-0 place-items-center overflow-hidden rounded">
      <FileThumb file={file} iconSize={20} />
    </span>
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
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "hover:bg-accent text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

function FolderTile({
  folder,
  onOpen,
  onOpenLocation,
  onToggleStar,
}: {
  folder: SearchFolderResult
  onOpen: () => void
  onOpenLocation?: () => void
  onToggleStar: () => void
}) {
  return (
    <div className="hover:bg-accent/30 group relative flex flex-col rounded-lg p-1 transition-colors">
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleStar()
        }}
        className={`absolute top-2 right-2 z-10 rounded p-0.5 transition-opacity ${
          folder.isStarred ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        aria-label="Toggle star"
      >
        <StarIcon
          size={14}
          weight={folder.isStarred ? "fill" : "regular"}
          className={folder.isStarred ? "text-yellow-500" : "text-muted-foreground"}
        />
      </button>
      <button onClick={onOpen} onDoubleClick={onOpen} className="flex flex-col text-left">
        <div className="grid aspect-4/3 place-items-center">
          <FolderIcon
            size={72}
            weight="fill"
            style={{ color: folder.color || undefined }}
            className={folder.color ? "" : "text-primary"}
          />
        </div>
        <div className="px-2 pb-1">
          <div className="truncate text-sm font-medium" title={folder.name}>
            {folder.name}
          </div>
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onOpenLocation?.()
        }}
        disabled={!onOpenLocation}
        className="text-muted-foreground hover:text-foreground truncate px-2 pb-2 text-left text-xs disabled:hover:no-underline hover:underline"
        title={folder.parentName ?? "My Drive"}
      >
        {folder.parentName ?? "My Drive"}
      </button>
    </div>
  )
}

function FileTile({
  file,
  onOpen,
  onOpenLocation,
  onToggleStar,
}: {
  file: SearchFileResult
  onOpen: () => void
  onOpenLocation: () => void
  onToggleStar: () => void
}) {
  return (
    <div className="hover:bg-accent/30 group relative flex flex-col overflow-visible rounded-lg transition-colors">
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleStar()
        }}
        className={`absolute top-2 right-9 z-10 rounded p-0.5 transition-opacity ${
          file.isStarred ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        aria-label="Toggle star"
      >
        <StarIcon
          size={14}
          weight={file.isStarred ? "fill" : "regular"}
          className={file.isStarred ? "text-yellow-500" : "text-muted-foreground"}
        />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          triggerDownload([{ type: "file", id: file.id }], file.name)
        }}
        className="text-muted-foreground hover:text-foreground absolute top-2 right-2 z-10 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Download"
      >
        <DownloadIcon size={14} />
      </button>
      <button onClick={onOpen} onDoubleClick={onOpen} className="flex flex-col text-left">
        <div className="bg-muted grid aspect-4/3 place-items-center overflow-hidden rounded-lg">
          <FileThumb file={file} iconSize={64} />
        </div>
        <div className="p-2 pb-1">
          <div className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </div>
          <div className="text-muted-foreground text-xs">{formatBytes(file.size)}</div>
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onOpenLocation()
        }}
        className="text-muted-foreground hover:text-foreground truncate px-2 pb-2 text-left text-xs hover:underline"
        title={file.folderName ?? undefined}
      >
        {file.folderName ?? "—"}
      </button>
    </div>
  )
}
