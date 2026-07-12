import { useEffect, useMemo, useState } from "react"
import {
  FileIcon,
  FileTextIcon,
  FileVideoIcon,
  FolderIcon,
  ImageIcon,
  ListBulletsIcon,
  SquaresFourIcon,
  StarIcon,
} from "@phosphor-icons/react"
import { useNavigate } from "react-router-dom"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
import { FilePreview } from "@/components/FilePreview"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { apiGet } from "@/lib/api"
import { formatBytes, formatDate } from "@/lib/format"
import { iconFor } from "@/lib/fileIcon"
import type { FileItem, Folder } from "@/lib/types"

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
  if (
    mime.includes("officedocument") ||
    /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|md|txt)$/i.test(name)
  )
    return "doc"
  return "other"
}

export function StarredPage() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"grid" | "list">("grid")
  const [filter, setFilter] = useState<TypeFilter>("all")
  const [preview, setPreview] = useState<FileItem | null>(null)
  const nav = useNavigate()

  useEffect(() => {
    setLoading(true)
    apiGet<{ folders: Folder[]; files: FileItem[] }>("/api/me/starred")
      .then((r) => {
        setFolders(r.folders)
        setFiles(r.files)
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredFiles = useMemo(
    () =>
      filter === "all"
        ? files
        : files.filter((f) => fileType(f.mimeType, f.name) === filter),
    [files, filter]
  )
  const showFolders = filter === "all"

  const isEmpty = folders.length === 0 && filteredFiles.length === 0

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <SidebarToggle />
            <StarIcon size={18} weight="fill" className="text-yellow-500" />
            <div className="text-sm font-semibold">Starred</div>
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
            <HeaderActions />
          </div>
        </header>

        <div className="flex items-center gap-2 overflow-x-auto border-b px-4 py-3 md:px-6">
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

        <div className="flex-1 overflow-auto px-4 py-5 md:px-6">
          {loading ? (
            <div className="text-muted-foreground py-20 text-center text-sm">
              Loading…
            </div>
          ) : isEmpty ? (
            <div className="text-muted-foreground py-20 text-center text-sm">
              Nothing starred yet. Hover over a file or folder in Drive and
              click the star to pin it here.
            </div>
          ) : view === "grid" ? (
            <div className="flex flex-col gap-8">
              {showFolders && folders.length > 0 && (
                <section>
                  <h2 className="text-muted-foreground mb-3 text-sm font-medium">
                    Folders
                  </h2>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
                    {folders.map((f) => (
                      <FolderTile
                        key={f.id}
                        folder={f}
                        onOpen={() => nav(`/drive/${f.id}`)}
                      />
                    ))}
                  </div>
                </section>
              )}
              {filteredFiles.length > 0 && (
                <section>
                  <h2 className="text-muted-foreground mb-3 text-sm font-medium">
                    Files
                  </h2>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                    {filteredFiles.map((f) => (
                      <FileTile
                        key={f.id}
                        file={f}
                        onOpen={() => setPreview(f)}
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
                    <TableHead className="p-0 py-2">Modified</TableHead>
                    <TableHead className="p-0 py-2 pr-3">Size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {showFolders &&
                    folders.map((f) => (
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
                          </div>
                        </TableCell>
                        <TableCell className="p-0 py-2">{formatDate(f.updatedAt)}</TableCell>
                        <TableCell className="p-0 py-2 pr-3">—</TableCell>
                      </TableRow>
                    ))}
                  {filteredFiles.map((f) => (
                    <TableRow
                      key={f.id}
                      className="cursor-pointer last:border-b-0"
                      onClick={() => setPreview(f)}
                    >
                      <TableCell className="p-0 py-2 pl-3">
                        <div className="flex items-center gap-2">
                          {iconFor(f.mimeType, 18, f.name)}
                          <span>{f.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="p-0 py-2">{formatDate(f.updatedAt)}</TableCell>
                      <TableCell className="p-0 py-2 pr-3">{formatBytes(f.size)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <FilePreview
          file={preview}
          onClose={() => setPreview(null)}
          items={filteredFiles}
          onNavigate={setPreview}
        />
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

function FolderTile({ folder, onOpen }: { folder: Folder; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      onDoubleClick={onOpen}
      className="hover:bg-accent/30 group relative flex flex-col rounded-lg p-1 text-left transition-colors"
    >
      <StarIcon
        size={14}
        weight="fill"
        className="text-yellow-500 absolute top-2 right-2 z-10"
      />
      <div className="grid aspect-4/3 place-items-center">
        <FolderIcon
          size={72}
          weight="fill"
          style={{ color: folder.color || undefined }}
          className={folder.color ? "" : "text-primary"}
        />
      </div>
      <div className="px-2 pb-2">
        <div className="truncate text-sm font-medium" title={folder.name}>
          {folder.name}
        </div>
        <div className="text-muted-foreground truncate text-xs">
          {formatDate(folder.updatedAt)}
        </div>
      </div>
    </button>
  )
}

function FileTile({ file, onOpen }: { file: FileItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      onDoubleClick={onOpen}
      className="hover:bg-accent/30 group relative flex flex-col overflow-visible rounded-lg text-left transition-colors"
    >
      <StarIcon
        size={14}
        weight="fill"
        className="text-yellow-500 absolute top-2 right-2 z-10"
      />
      <div className="bg-muted grid aspect-4/3 place-items-center overflow-hidden rounded-lg">
        {iconFor(file.mimeType, 64, file.name)}
      </div>
      <div className="p-2">
        <div className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </div>
        <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
          <span>{formatBytes(file.size)}</span>
          <span>{formatDate(file.updatedAt)}</span>
        </div>
      </div>
    </button>
  )
}
