import { useEffect, useState } from "react"
import {
  ArrowCounterClockwiseIcon,
  FolderIcon,
  ListBulletsIcon,
  SquaresFourIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
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
import { useDrive } from "@/store/drive"
import { useMe } from "@/store/me"
import { toast } from "@/store/toast"
import { confirmDialog } from "@/store/confirm"
import { formatBytes, formatDate } from "@/lib/format"
import { iconFor } from "@/lib/fileIcon"
import { FilePreview } from "@/components/FilePreview"
import type { FileItem, Folder } from "@/lib/types"
import { HoverName } from "@/components/HoverName"

type Menu = {
  x: number
  y: number
  type: "folder" | "file"
  id: string
  name: string
}

export function BinPage() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"grid" | "list">("grid")
  const [menu, setMenu] = useState<Menu | null>(null)
  const [preview, setPreview] = useState<FileItem | null>(null)
  const restoreItem = useDrive((s) => s.restoreItem)
  const deleteItem = useDrive((s) => s.deleteItem)
  const loadQuota = useMe((s) => s.loadQuota)
  const [clearing, setClearing] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      const data = await apiGet<{ folders: Folder[]; files: FileItem[] }>(
        "/api/me/trash"
      )
      setFolders(data.folders)
      setFiles(data.files)
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
  async function remove(type: "folder" | "file", id: string, name: string) {
    const ok = await confirmDialog({
      title: "Delete forever?",
      description: `"${name}" will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete forever",
      destructive: true,
    })
    if (!ok) return
    await deleteItem(type, id)
    await reload()
  }
  async function emptyBin() {
    const n = folders.length + files.length
    if (n === 0) return
    const ok = await confirmDialog({
      title: "Empty the bin?",
      description: `All ${n} item${n === 1 ? "" : "s"} in the bin will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Empty bin",
      destructive: true,
    })
    if (!ok) return
    setClearing(true)
    try {
      const r = await apiJson<{ files: number; folders: number }>(
        "/api/me/trash/empty",
        "POST"
      )
      await reload()
      void loadQuota()
      toast.success(
        `Bin emptied — ${r.files} file${r.files === 1 ? "" : "s"}` +
          ` and ${r.folders} folder${r.folders === 1 ? "" : "s"} deleted.`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't empty the bin.")
    } finally {
      setClearing(false)
    }
  }

  function openMenu(
    e: React.MouseEvent,
    type: "folder" | "file",
    id: string,
    name: string
  ) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, type, id, name })
  }
  const closeMenu = () => setMenu(null)

  const isEmpty = folders.length === 0 && files.length === 0

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main
        className="flex min-w-0 flex-1 flex-col"
        onClick={closeMenu}
      >
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <SidebarToggle />
            <TrashIcon size={18} />
            <div className="text-sm font-semibold">Bin</div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive mr-1"
              onClick={emptyBin}
              disabled={clearing || isEmpty}
              title="Permanently delete everything in the bin"
            >
              <TrashIcon size={14} weight="fill" />
              <span className="hidden sm:inline">{clearing ? "Emptying…" : "Empty bin"}</span>
            </Button>
            <Button
              size="sm"
              variant={view === "grid" ? "default" : "ghost"}
              onClick={() => setView("grid")}
              title="Grid view"
            >
              <SquaresFourIcon size={16} />
            </Button>
            <Button
              size="sm"
              variant={view === "list" ? "default" : "ghost"}
              onClick={() => setView("list")}
              title="List view"
            >
              <ListBulletsIcon size={16} />
            </Button>
            <HeaderActions onReload={() => void reload()} />
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="text-muted-foreground grid h-full place-items-center text-sm">
              Loading…
            </div>
          ) : isEmpty ? (
            <div className="text-muted-foreground grid h-full place-items-center text-sm">
              The bin is empty. Items you trash will show up here.
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 p-2">
              {folders.map((f) => (
                <TrashFolderCard
                  key={f.id}
                  folder={f}
                  onContextMenu={(e) => openMenu(e, "folder", f.id, f.name)}
                  onRestore={() => restore("folder", f.id)}
                />
              ))}
              {files.map((f) => (
                <TrashFileCard
                  key={f.id}
                  file={f}
                  onContextMenu={(e) => openMenu(e, "file", f.id, f.name)}
                  onOpen={() => setPreview(f)}
                  onRestore={() => restore("file", f.id)}
                />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="p-0 py-2 pl-4">Name</TableHead>
                  <TableHead className="p-0 py-2">Trashed</TableHead>
                  <TableHead className="p-0 py-2">Size</TableHead>
                  <TableHead className="p-0 py-2 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {folders.map((f) => (
                  <TableRow
                    key={f.id}
                    onContextMenu={(e) => openMenu(e, "folder", f.id, f.name)}
                  >
                    <TableCell className="p-0 py-2 pl-4">
                      <div className="flex items-center gap-2">
                        <FolderIcon
                          size={20}
                          weight="fill"
                          style={{ color: f.color || undefined }}
                          className={f.color ? "" : "text-primary"}
                        />
                        <HoverName as="span" name={f.name} className="min-w-0 truncate" />
                      </div>
                    </TableCell>
                    <TableCell className="p-0 py-2">{formatDate(f.updatedAt)}</TableCell>
                    <TableCell className="p-0 py-2">—</TableCell>
                    <TableCell className="p-0 py-2 pr-4">
                      <RowActions
                        onRestore={() => restore("folder", f.id)}
                        onDelete={() => remove("folder", f.id, f.name)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {files.map((f) => (
                  <TableRow
                    key={f.id}
                    className="cursor-pointer"
                    onClick={() => setPreview(f)}
                    onContextMenu={(e) => openMenu(e, "file", f.id, f.name)}
                  >
                    <TableCell className="p-0 py-2 pl-4">
                      <div className="flex items-center gap-2">
                        {iconFor(f.mimeType, 20, f.name)}
                        <HoverName as="span" name={f.name} className="min-w-0 truncate" />
                      </div>
                    </TableCell>
                    <TableCell className="p-0 py-2">{formatDate(f.updatedAt)}</TableCell>
                    <TableCell className="p-0 py-2">{formatBytes(f.size)}</TableCell>
                    <TableCell className="p-0 py-2 pr-4" onClick={(e) => e.stopPropagation()}>
                      <RowActions
                        onRestore={() => restore("file", f.id)}
                        onDelete={() => remove("file", f.id, f.name)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {menu && (
          <ul
            className="bg-popover text-popover-foreground fixed z-50 w-48 rounded-md border p-1 text-sm shadow-lg"
            style={{ left: menu.x, top: menu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <li>
              <button
                className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left"
                onClick={async () => {
                  await restore(menu.type, menu.id)
                  closeMenu()
                }}
              >
                <ArrowCounterClockwiseIcon size={16} /> Restore
              </button>
            </li>
            <li>
              <button
                className="hover:bg-accent text-destructive flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left"
                onClick={async () => {
                  await remove(menu.type, menu.id, menu.name)
                  closeMenu()
                }}
              >
                <TrashIcon size={16} weight="fill" /> Delete forever
              </button>
            </li>
          </ul>
        )}

        <FilePreview
          file={preview}
          onClose={() => setPreview(null)}
          items={files}
          onNavigate={setPreview}
        />
      </main>
    </div>
  )
}

function TrashFolderCard({
  folder,
  onContextMenu,
  onRestore,
}: {
  folder: Folder
  onContextMenu: (e: React.MouseEvent) => void
  onRestore: () => void
}) {
  return (
    <div
      className="group hover:bg-accent/30 relative cursor-default rounded-lg transition-colors"
      onContextMenu={onContextMenu}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRestore()
        }}
        title="Restore"
        className="bg-background/70 absolute top-2 right-2 z-10 rounded-full p-1.5 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
      >
        <ArrowCounterClockwiseIcon size={12} />
      </button>
      <div className="grid aspect-4/3 place-items-center">
        <FolderIcon
          size={72}
          weight="fill"
          style={{ color: folder.color || undefined }}
          className={folder.color ? "" : "text-primary"}
        />
      </div>
      <div className="px-2 pb-2">
        <HoverName
          as="div"
          name={folder.name}
          className="truncate text-sm font-medium"
        />
        <div className="text-muted-foreground truncate text-xs">
          Trashed {formatDate(folder.updatedAt)}
        </div>
      </div>
    </div>
  )
}

function TrashFileCard({
  file,
  onContextMenu,
  onOpen,
  onRestore,
}: {
  file: FileItem
  onContextMenu: (e: React.MouseEvent) => void
  onOpen: () => void
  onRestore: () => void
}) {
  return (
    <div
      className="group hover:bg-accent/30 relative cursor-pointer rounded-lg transition-colors"
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRestore()
        }}
        title="Restore"
        className="bg-background/70 absolute top-2 right-2 z-10 rounded-full p-1.5 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
      >
        <ArrowCounterClockwiseIcon size={12} />
      </button>
      <div className="bg-muted grid aspect-4/3 place-items-center overflow-hidden rounded-lg">
        {iconFor(file.mimeType, 64, file.name)}
      </div>
      <div className="p-2">
        <HoverName
          as="div"
          name={file.name}
          className="truncate text-sm font-medium"
        />
        <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
          <span>{formatBytes(file.size)}</span>
          <span>Trashed {formatDate(file.updatedAt)}</span>
        </div>
      </div>
    </div>
  )
}

function RowActions({
  onRestore,
  onDelete,
}: {
  onRestore: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={onRestore} title="Restore">
        <ArrowCounterClockwiseIcon size={14} />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        onClick={onDelete}
        title="Delete forever"
      >
        <TrashIcon size={14} weight="fill" />
      </Button>
    </div>
  )
}

