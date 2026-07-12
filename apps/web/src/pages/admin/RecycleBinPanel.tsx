import { useEffect, useState } from "react"
import {
  ArrowCounterClockwiseIcon,
  ArrowsOutCardinalIcon,
  CaretRightIcon,
  FolderIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@workspace/ui/components/avatar"
import { apiGet, apiJson } from "@/lib/api"
import { formatBytes, formatDate, relativeTime } from "@/lib/format"
import { iconFor } from "@/lib/fileIcon"
import { toast } from "@/store/toast"
import { FilePreview } from "@/components/FilePreview"
import { useAdminFilePreview } from "./useAdminFilePreview"
import { RecycleBinMoveDialog } from "./RecycleBinMoveDialog"
import type {
  AdminUser,
  FileItem,
  Folder,
  RecycleBinData,
  RecycleBinFile,
  RecycleBinFolder,
  RecycleBinPerson,
} from "@/lib/types"

type Busy = { id: string; action: "restore" | "purge" } | null
type MoveTarget = { type: "file" | "folder"; id: string; name: string } | null

export function RecycleBinPanel({ users }: { users: AdminUser[] }) {
  const [data, setData] = useState<RecycleBinData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Busy>(null)
  const [purgingAll, setPurgingAll] = useState(false)
  const [moveTarget, setMoveTarget] = useState<MoveTarget>(null)
  const { preview, loadingId, open, close } = useAdminFilePreview()

  async function reload() {
    try {
      setData(await apiGet<RecycleBinData>("/api/admin/recycle-bin"))
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Couldn't load the recycle bin."
      )
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void reload()
  }, [])

  async function restore(type: "file" | "folder", id: string, name: string) {
    setBusy({ id, action: "restore" })
    try {
      await apiJson("/api/admin/recycle-bin/restore", "POST", { type, id })
      await reload()
      toast.success(`Restored "${name}" to ${type === "folder" ? "its" : "the"} owner's drive.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't restore.")
    } finally {
      setBusy(null)
    }
  }

  async function moveTo(destFolderId: string) {
    if (!moveTarget) return
    const { type, id, name } = moveTarget
    setBusy({ id, action: "restore" })
    try {
      await apiJson("/api/admin/recycle-bin/restore", "POST", { type, id, destFolderId })
      await reload()
      toast.success(`Moved "${name}" to the selected folder.`)
    } finally {
      setBusy(null)
    }
  }

  async function purge(type: "file" | "folder", id: string, name: string) {
    if (
      !confirm(
        `Permanently erase "${name}" from the system? This deletes it for good — it cannot be recovered.`
      )
    )
      return
    setBusy({ id, action: "purge" })
    try {
      await apiJson("/api/admin/recycle-bin/purge", "POST", { type, id })
      await reload()
      toast.success(`"${name}" erased for good.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't purge.")
    } finally {
      setBusy(null)
    }
  }

  async function purgeAll() {
    if (!data || data.totals.files + data.totals.folders === 0) return
    if (
      !confirm(
        "Permanently erase everything in the recycle bin? This deletes all retained files and folders for good and cannot be undone."
      )
    )
      return
    setPurgingAll(true)
    try {
      const r = await apiJson<{ files: number; folders: number }>(
        "/api/admin/recycle-bin/purge-all",
        "POST"
      )
      await reload()
      toast.success(
        `Recycle bin cleared — ${r.files} file${r.files === 1 ? "" : "s"}` +
          ` and ${r.folders} folder${r.folders === 1 ? "" : "s"} erased.`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't clear the recycle bin.")
    } finally {
      setPurgingAll(false)
    }
  }

  const isEmpty =
    !!data && data.folders.length === 0 && data.files.length === 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrashIcon size={16} />
              Recycle bin
            </CardTitle>
            <CardDescription>
              Everything users have permanently deleted is retained here. Click
              a file to preview it or a folder to browse what's inside — only
              you can restore items or erase them for good.
            </CardDescription>
          </div>
          {data && (
            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden text-right text-xs text-muted-foreground sm:block">
                <div className="text-foreground text-sm font-semibold">
                  {formatBytes(data.totals.bytes)}
                </div>
                {data.totals.files.toLocaleString()} file
                {data.totals.files === 1 ? "" : "s"} ·{" "}
                {data.totals.folders.toLocaleString()} folder
                {data.totals.folders === 1 ? "" : "s"}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={purgeAll}
                disabled={purgingAll || isEmpty}
                title="Permanently erase everything in the recycle bin"
              >
                <TrashIcon size={14} weight="fill" />
                <span className="hidden sm:inline">
                  {purgingAll ? "Erasing…" : "Purge all"}
                </span>
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-muted-foreground py-10 text-center text-sm">
            Loading…
          </div>
        ) : isEmpty ? (
          <div className="text-muted-foreground py-10 text-center text-sm">
            The recycle bin is empty. Nothing has been permanently deleted yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="p-0 py-2 pr-3 text-[10px] uppercase tracking-wider">Name</TableHead>
                  <TableHead className="p-0 py-2 pr-3 text-[10px] uppercase tracking-wider">Owner</TableHead>
                  <TableHead className="p-0 py-2 pr-3 text-[10px] uppercase tracking-wider">Deleted by</TableHead>
                  <TableHead className="p-0 py-2 pr-3 text-[10px] uppercase tracking-wider">Deleted</TableHead>
                  <TableHead className="p-0 py-2 pr-3 text-right text-[10px] uppercase tracking-wider">Size</TableHead>
                  <TableHead className="p-0 py-2" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.folders.map((f) => (
                  <FolderRow
                    key={`folder-${f.id}`}
                    folder={f}
                    depth={0}
                    busy={busy}
                    loadingFileId={loadingId}
                    onRestore={() => restore("folder", f.id, f.name)}
                    onMove={() => setMoveTarget({ type: "folder", id: f.id, name: f.name })}
                    onPurge={() => purge("folder", f.id, f.name)}
                    onOpenFile={open}
                  />
                ))}
                {data!.files.map((f) => (
                  <FileRow
                    key={`file-${f.id}`}
                    file={f}
                    busy={busy}
                    isLoading={loadingId === f.id}
                    onOpen={() => open(f.id)}
                    onRestore={() => restore("file", f.id, f.name)}
                    onMove={() => setMoveTarget({ type: "file", id: f.id, name: f.name })}
                    onPurge={() => purge("file", f.id, f.name)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <FilePreview file={preview} onClose={close} />
      <RecycleBinMoveDialog
        open={!!moveTarget}
        item={moveTarget}
        users={users}
        onClose={() => setMoveTarget(null)}
        onSubmit={moveTo}
      />
    </Card>
  )
}

function PersonCell({ person }: { person: RecycleBinPerson | null }) {
  if (!person) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex items-center gap-2" title={person.email}>
      <Avatar className="h-6 w-6 shrink-0">
        {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
        <AvatarFallback>{person.name[0]?.toUpperCase() ?? "?"}</AvatarFallback>
      </Avatar>
      <span className="truncate">{person.name}</span>
    </div>
  )
}

function RowActions({
  id,
  busy,
  onRestore,
  onMove,
  onPurge,
}: {
  id: string
  busy: Busy
  onRestore: () => void
  onMove: () => void
  onPurge: () => void
}) {
  const disabled = busy?.id === id
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation()
          onRestore()
        }}
        disabled={disabled}
        title="Restore to its original location"
      >
        <ArrowCounterClockwiseIcon size={14} />
        <span className="hidden lg:inline">Restore</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation()
          onMove()
        }}
        disabled={disabled}
        title="Move to any folder in any user's drive"
      >
        <ArrowsOutCardinalIcon size={14} />
        <span className="hidden lg:inline">Move to…</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        onClick={(e) => {
          e.stopPropagation()
          onPurge()
        }}
        disabled={disabled}
        title="Erase permanently"
      >
        <TrashIcon size={14} weight="fill" />
        <span className="hidden lg:inline">Purge</span>
      </Button>
    </div>
  )
}

function FolderRow({
  folder,
  depth,
  busy,
  loadingFileId,
  onRestore,
  onMove,
  onPurge,
  onOpenFile,
}: {
  folder: RecycleBinFolder
  depth: number
  busy: Busy
  loadingFileId: string | null
  onRestore: () => void
  onMove: () => void
  onPurge: () => void
  onOpenFile: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const contents: string[] = []
  if (folder.fileCount)
    contents.push(`${folder.fileCount} file${folder.fileCount === 1 ? "" : "s"}`)
  if (folder.folderCount)
    contents.push(
      `${folder.folderCount} folder${folder.folderCount === 1 ? "" : "s"}`
    )
  const isEmptyFolder = folder.fileCount === 0 && folder.folderCount === 0

  return (
    <>
      <TableRow
        className={isEmptyFolder ? "" : "cursor-pointer"}
        onClick={() => !isEmptyFolder && setExpanded((v) => !v)}
      >
        <TableCell className="p-0 py-2 pr-3">
          <div
            className="flex items-center gap-2"
            style={{ paddingLeft: depth * 20 }}
          >
            {isEmptyFolder ? (
              <span className="w-3.5 shrink-0" />
            ) : (
              <CaretRightIcon
                size={12}
                weight="bold"
                className={`text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
              />
            )}
            <FolderIcon
              size={20}
              weight="fill"
              style={{ color: folder.color || undefined }}
              className={folder.color ? "shrink-0" : "text-primary shrink-0"}
            />
            <div className="min-w-0">
              <div className="truncate font-medium" title={folder.name}>
                {folder.name}
              </div>
              <div className="text-muted-foreground text-xs">
                {contents.length ? contents.join(" · ") : "empty folder"}
              </div>
            </div>
          </div>
        </TableCell>
        <TableCell className="p-0 py-2 pr-3">
          <PersonCell person={folder.owner} />
        </TableCell>
        <TableCell className="p-0 py-2 pr-3">
          <PersonCell person={folder.deletedBy} />
        </TableCell>
        <TableCell
          className="text-muted-foreground p-0 py-2 pr-3 whitespace-nowrap"
          title={formatDate(folder.deletedAt)}
        >
          {relativeTime(folder.deletedAt)}
        </TableCell>
        <TableCell className="p-0 py-2 pr-3 text-right tabular-nums whitespace-nowrap">
          {formatBytes(folder.sizeBytes)}
        </TableCell>
        <TableCell className="p-0 py-2">
          <RowActions
            id={folder.id}
            busy={busy}
            onRestore={onRestore}
            onMove={onMove}
            onPurge={onPurge}
          />
        </TableCell>
      </TableRow>
      {expanded && (
        <FolderContents
          folderId={folder.id}
          depth={depth + 1}
          loadingFileId={loadingFileId}
          onOpenFile={onOpenFile}
        />
      )}
    </>
  )
}

// Drill-down into a deleted folder's (retained) contents. Reuses the ordinary
// folder-contents endpoint with includeTrashed=1 — admins get read access to
// any folder regardless of owner (see api lib/access.ts) — so this shows
// exactly what the owner had at the moment of deletion. Subfolders expand
// recursively the same way as the top-level recycle bin rows.
function FolderContents({
  folderId,
  depth,
  loadingFileId,
  onOpenFile,
}: {
  folderId: string
  depth: number
  loadingFileId: string | null
  onOpenFile: (id: string) => void
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; folders: Folder[]; files: FileItem[] }
  >({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    apiGet<{ folders: Folder[]; files: FileItem[] }>(
      `/api/folders/${folderId}/contents?includeHidden=1&includeTrashed=1`
    )
      .then((data) => {
        if (!cancelled)
          setState({ status: "ready", folders: data.folders, files: data.files })
      })
      .catch((e) => {
        if (!cancelled)
          setState({
            status: "error",
            message: e instanceof Error ? e.message : "Couldn't load contents.",
          })
      })
    return () => {
      cancelled = true
    }
  }, [folderId])

  if (state.status === "loading") {
    return (
      <TableRow>
        <TableCell colSpan={6} className="text-muted-foreground p-0 py-2 pr-3 text-xs">
          <div style={{ paddingLeft: depth * 20 + 20 }}>Loading…</div>
        </TableCell>
      </TableRow>
    )
  }
  if (state.status === "error") {
    return (
      <TableRow>
        <TableCell colSpan={6} className="text-destructive p-0 py-2 pr-3 text-xs">
          <div style={{ paddingLeft: depth * 20 + 20 }}>{state.message}</div>
        </TableCell>
      </TableRow>
    )
  }
  if (state.folders.length === 0 && state.files.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={6} className="text-muted-foreground p-0 py-2 pr-3 text-xs">
          <div style={{ paddingLeft: depth * 20 + 20 }}>Empty.</div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <>
      {state.folders.map((f) => (
        <NestedFolderRow
          key={f.id}
          folder={f}
          depth={depth}
          loadingFileId={loadingFileId}
          onOpenFile={onOpenFile}
        />
      ))}
      {state.files.map((f) => (
        <TableRow
          key={f.id}
          className="cursor-pointer"
          onClick={() => onOpenFile(f.id)}
        >
          <TableCell className="p-0 py-2 pr-3">
            <div
              className="flex items-center gap-2"
              style={{ paddingLeft: depth * 20 + 16 }}
            >
              <span className="shrink-0">{iconFor(f.mimeType, 18, f.name)}</span>
              <span
                className={`truncate ${loadingFileId === f.id ? "text-muted-foreground" : ""}`}
                title={f.name}
              >
                {f.name}
              </span>
            </div>
          </TableCell>
          <TableCell className="p-0 py-2 pr-3" colSpan={3} />
          <TableCell className="p-0 py-2 pr-3 text-right tabular-nums whitespace-nowrap">
            {formatBytes(f.size)}
          </TableCell>
          <TableCell className="p-0 py-2" />
        </TableRow>
      ))}
    </>
  )
}

// Subfolder found while drilling into a deleted tree — same expand affordance
// as the top-level rows, minus Restore/Purge (those apply to the top-level
// ancestor; the whole subtree moves together).
function NestedFolderRow({
  folder,
  depth,
  loadingFileId,
  onOpenFile,
}: {
  folder: Folder
  depth: number
  loadingFileId: string | null
  onOpenFile: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell className="p-0 py-2 pr-3" colSpan={6}>
          <div
            className="flex items-center gap-2"
            style={{ paddingLeft: depth * 20 }}
          >
            <CaretRightIcon
              size={12}
              weight="bold"
              className={`text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
            <FolderIcon
              size={16}
              weight="fill"
              style={{ color: folder.color || undefined }}
              className={folder.color ? "shrink-0" : "text-primary shrink-0"}
            />
            <span className="truncate" title={folder.name}>
              {folder.name}
            </span>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <FolderContents
          folderId={folder.id}
          depth={depth + 1}
          loadingFileId={loadingFileId}
          onOpenFile={onOpenFile}
        />
      )}
    </>
  )
}

function FileRow({
  file,
  busy,
  isLoading,
  onOpen,
  onRestore,
  onMove,
  onPurge,
}: {
  file: RecycleBinFile
  busy: Busy
  isLoading: boolean
  onOpen: () => void
  onRestore: () => void
  onMove: () => void
  onPurge: () => void
}) {
  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell className="p-0 py-2 pr-3">
        <div className="flex items-center gap-2">
          <span className="shrink-0">{iconFor(file.mimeType, 20, file.name)}</span>
          <span
            className={`truncate font-medium ${isLoading ? "text-muted-foreground" : ""}`}
            title={file.name}
          >
            {file.name}
          </span>
        </div>
      </TableCell>
      <TableCell className="p-0 py-2 pr-3">
        <PersonCell person={file.owner} />
      </TableCell>
      <TableCell className="p-0 py-2 pr-3">
        <PersonCell person={file.deletedBy} />
      </TableCell>
      <TableCell
        className="text-muted-foreground p-0 py-2 pr-3 whitespace-nowrap"
        title={formatDate(file.deletedAt)}
      >
        {relativeTime(file.deletedAt)}
      </TableCell>
      <TableCell className="p-0 py-2 pr-3 text-right tabular-nums whitespace-nowrap">
        {formatBytes(file.size)}
      </TableCell>
      <TableCell className="p-0 py-2">
        <RowActions
          id={file.id}
          busy={busy}
          onRestore={onRestore}
          onMove={onMove}
          onPurge={onPurge}
        />
      </TableCell>
    </TableRow>
  )
}
