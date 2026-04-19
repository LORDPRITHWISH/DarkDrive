import { useEffect, useState } from "react"
import {
  FolderIcon,
  FileIcon,
  ImageIcon,
  FileVideoIcon,
  FileAudioIcon,
  FilePdfIcon,
  FileZipIcon,
  FileTextIcon,
  ArrowCounterClockwiseIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import { Sidebar } from "@/components/Sidebar"
import { Button } from "@workspace/ui/components/button"
import { apiGet } from "@/lib/api"
import { useDrive } from "@/store/drive"
import { formatBytes, formatDate } from "@/lib/format"
import type { FileItem, Folder } from "@/lib/types"

function iconFor(mime: string, size = 18) {
  if (mime.startsWith("image/")) return <ImageIcon size={size} weight="fill" />
  if (mime.startsWith("video/")) return <FileVideoIcon size={size} weight="fill" />
  if (mime.startsWith("audio/")) return <FileAudioIcon size={size} weight="fill" />
  if (mime === "application/pdf") return <FilePdfIcon size={size} weight="fill" />
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("rar"))
    return <FileZipIcon size={size} weight="fill" />
  if (mime.startsWith("text/")) return <FileTextIcon size={size} weight="fill" />
  return <FileIcon size={size} weight="fill" />
}

export function BinPage() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const restoreItem = useDrive((s) => s.restoreItem)
  const deleteItem = useDrive((s) => s.deleteItem)

  async function reload() {
    setLoading(true)
    try {
      const r = await apiGet<{ folders: Folder[]; files: FileItem[] }>("/api/me/trash")
      setFolders(r.folders)
      setFiles(r.files)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  async function restore(type: "folder" | "file", id: string) {
    await restoreItem(type, id)
    await reload()
  }
  async function purge(type: "folder" | "file", id: string, name: string) {
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return
    await deleteItem(type, id)
    await reload()
  }

  const empty = folders.length === 0 && files.length === 0

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <div className="text-sm font-semibold">Bin</div>
        </header>
        <div className="flex-1 overflow-auto px-6 py-5">
          {loading ? (
            <div className="text-muted-foreground text-sm">Loading…</div>
          ) : empty ? (
            <div className="text-muted-foreground py-20 text-center text-sm">
              Bin is empty. Items you trash will appear here.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b text-xs uppercase">
                  <tr>
                    <th className="py-2 pl-3 text-left font-medium">Name</th>
                    <th className="py-2 text-left font-medium">Trashed</th>
                    <th className="py-2 text-left font-medium">Size</th>
                    <th className="py-2 pr-3" />
                  </tr>
                </thead>
                <tbody>
                  {folders.map((f) => (
                    <tr key={f.id} className="hover:bg-accent/40 border-b last:border-b-0">
                      <td className="py-2 pl-3">
                        <div className="flex items-center gap-2">
                          <FolderIcon
                            size={18}
                            weight="fill"
                            style={{ color: f.color || undefined }}
                            className={f.color ? "" : "text-primary"}
                          />
                          <span>{f.name}</span>
                        </div>
                      </td>
                      <td className="py-2">{formatDate(f.updatedAt)}</td>
                      <td className="py-2">—</td>
                      <td className="py-2 pr-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => restore("folder", f.id)}
                            title="Restore"
                          >
                            <ArrowCounterClockwiseIcon size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => purge("folder", f.id, f.name)}
                            title="Delete forever"
                          >
                            <TrashIcon size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {files.map((f) => (
                    <tr key={f.id} className="hover:bg-accent/40 border-b last:border-b-0">
                      <td className="py-2 pl-3">
                        <div className="flex items-center gap-2">
                          {iconFor(f.mimeType)}
                          <span>{f.name}</span>
                        </div>
                      </td>
                      <td className="py-2">{formatDate(f.updatedAt)}</td>
                      <td className="py-2">{formatBytes(f.size)}</td>
                      <td className="py-2 pr-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => restore("file", f.id)}
                            title="Restore"
                          >
                            <ArrowCounterClockwiseIcon size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => purge("file", f.id, f.name)}
                            title="Delete forever"
                          >
                            <TrashIcon size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
