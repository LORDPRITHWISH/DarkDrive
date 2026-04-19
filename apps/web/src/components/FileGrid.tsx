import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  FolderIcon,
  FileIcon,
  ImageIcon,
  FileVideoIcon,
  FileAudioIcon,
  FilePdfIcon,
  FileZipIcon,
  FileTextIcon,
  DotsThreeIcon,
  StarIcon,
  EyeSlashIcon,
  EyeIcon,
  TrashIcon,
  ShareNetworkIcon,
  DownloadIcon,
  PencilSimpleIcon,
  InfoIcon,
  EyeIcon as OpenEyeIcon,
} from "@phosphor-icons/react"
import { useDrive } from "@/store/drive"
import type { FileItem, Folder } from "@/lib/types"
import { formatBytes, formatDate } from "@/lib/format"
import { apiUrl } from "@/lib/config"
import { ShareDialog } from "./ShareDialog"
import { FilePreview } from "./FilePreview"
import { NewFolderDialog } from "./NewFolderDialog"

function iconFor(mime: string, size = 28) {
  if (mime.startsWith("image/")) return <ImageIcon size={size} weight="fill" />
  if (mime.startsWith("video/")) return <FileVideoIcon size={size} weight="fill" />
  if (mime.startsWith("audio/")) return <FileAudioIcon size={size} weight="fill" />
  if (mime === "application/pdf") return <FilePdfIcon size={size} weight="fill" />
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("rar"))
    return <FileZipIcon size={size} weight="fill" />
  if (mime.startsWith("text/")) return <FileTextIcon size={size} weight="fill" />
  return <FileIcon size={size} weight="fill" />
}

type Menu =
  | null
  | { x: number; y: number; type: "folder" | "file"; id: string; name: string }

export function FileGrid() {
  const {
    folders,
    files,
    view,
    selection,
    select,
    deleteItem,
    trashItem,
    restoreItem,
    toggleHiddenItem,
    toggleStarred,
    renameFile,
    renameFolder,
    recolorFolder,
  } = useDrive()
  const nav = useNavigate()
  const [menu, setMenu] = useState<Menu>(null)
  const [share, setShare] = useState<{ type: "FILE" | "FOLDER"; id: string; name: string } | null>(
    null
  )
  const [preview, setPreview] = useState<FileItem | null>(null)
  const [colorEditFolder, setColorEditFolder] = useState<Folder | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  function openMenu(e: React.MouseEvent, type: "folder" | "file", id: string, name: string) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, type, id, name })
  }

  function closeMenu() {
    setMenu(null)
  }

  async function doRename(type: "folder" | "file", id: string) {
    if (!renameValue.trim()) return setRenaming(null)
    if (type === "folder") await renameFolder(id, renameValue.trim())
    else await renameFile(id, renameValue.trim())
    setRenaming(null)
  }

  const isEmpty = folders.length === 0 && files.length === 0

  if (isEmpty) {
    return (
      <div className="text-muted-foreground grid h-full place-items-center text-sm">
        This folder is empty. Drag files in or use Upload.
      </div>
    )
  }

  return (
    <div onClick={closeMenu}>
      {view === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 p-2">
          {folders.map((f) => (
            <GridCard
              key={f.id}
              selected={selection.has(f.id)}
              onClick={(e) => select(f.id, e.metaKey || e.ctrlKey || e.shiftKey)}
              onDoubleClick={() => nav(`/drive/${f.id}`)}
              onContextMenu={(e) => openMenu(e, "folder", f.id, f.name)}
              folder={f}
              renaming={renaming === f.id}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              onRenameCommit={() => doRename("folder", f.id)}
              onRenameCancel={() => setRenaming(null)}
            />
          ))}
          {files.map((f) => (
            <GridCardFile
              key={f.id}
              selected={selection.has(f.id)}
              onClick={(e) => select(f.id, e.metaKey || e.ctrlKey || e.shiftKey)}
              onDoubleClick={() => setPreview(f)}
              onContextMenu={(e) => openMenu(e, "file", f.id, f.name)}
              file={f}
              renaming={renaming === f.id}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              onRenameCommit={() => doRename("file", f.id)}
              onRenameCancel={() => setRenaming(null)}
            />
          ))}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-muted-foreground border-b text-xs uppercase">
            <tr>
              <th className="py-2 pl-4 text-left font-medium">Name</th>
              <th className="py-2 text-left font-medium">Modified</th>
              <th className="py-2 text-left font-medium">Size</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {folders.map((f) => (
              <tr
                key={f.id}
                className={`hover:bg-accent/40 cursor-pointer border-b ${
                  selection.has(f.id) ? "bg-accent/60" : ""
                }`}
                onClick={(e) => select(f.id, e.metaKey || e.ctrlKey || e.shiftKey)}
                onDoubleClick={() => nav(`/drive/${f.id}`)}
                onContextMenu={(e) => openMenu(e, "folder", f.id, f.name)}
              >
                <td className="py-2 pl-4">
                  <div className="flex items-center gap-2">
                    <FolderIcon
                      size={20}
                      weight="fill"
                      style={{ color: f.color || undefined }}
                      className={f.color ? "" : "text-primary"}
                    />
                    <span className={f.isHidden ? "opacity-60 italic" : ""}>{f.name}</span>
                    {f.isStarred && <StarIcon size={14} weight="fill" className="text-yellow-500" />}
                  </div>
                </td>
                <td className="py-2">{formatDate(f.updatedAt)}</td>
                <td className="py-2">—</td>
                <td className="py-2 pr-4 text-right">
                  <button
                    onClick={(e) => openMenu(e, "folder", f.id, f.name)}
                    className="hover:bg-accent rounded p-1"
                  >
                    <DotsThreeIcon size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {files.map((f) => (
              <tr
                key={f.id}
                className={`hover:bg-accent/40 cursor-pointer border-b ${
                  selection.has(f.id) ? "bg-accent/60" : ""
                }`}
                onClick={(e) => select(f.id, e.metaKey || e.ctrlKey || e.shiftKey)}
                onDoubleClick={() => setPreview(f)}
                onContextMenu={(e) => openMenu(e, "file", f.id, f.name)}
              >
                <td className="py-2 pl-4">
                  <div className="flex items-center gap-2">
                    {iconFor(f.mimeType, 20)}
                    <span className={f.isHidden ? "opacity-60 italic" : ""}>{f.name}</span>
                    {f.isStarred && <StarIcon size={14} weight="fill" className="text-yellow-500" />}
                  </div>
                </td>
                <td className="py-2">{formatDate(f.updatedAt)}</td>
                <td className="py-2">{formatBytes(f.size)}</td>
                <td className="py-2 pr-4 text-right">
                  <button
                    onClick={(e) => openMenu(e, "file", f.id, f.name)}
                    className="hover:bg-accent rounded p-1"
                  >
                    <DotsThreeIcon size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {menu && (
        <ul
          className="bg-popover text-popover-foreground fixed z-50 w-56 rounded-md border p-1 text-sm shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.type === "file" && (
            <>
              <MenuItem
                icon={<OpenEyeIcon size={16} />}
                onClick={() => {
                  const f = files.find((x) => x.id === menu.id)
                  if (f) setPreview(f)
                  closeMenu()
                }}
              >
                Open
              </MenuItem>
              <MenuItem
                icon={<InfoIcon size={16} />}
                onClick={() => {
                  const f = files.find((x) => x.id === menu.id)
                  if (f) setPreview(f)
                  closeMenu()
                }}
              >
                Properties
              </MenuItem>
              <MenuItem
                icon={<DownloadIcon size={16} />}
                onClick={() => {
                  window.open(apiUrl(`/api/files/${menu.id}/download`), "_blank")
                  closeMenu()
                }}
              >
                Download
              </MenuItem>
            </>
          )}
          <MenuItem
            icon={<PencilSimpleIcon size={16} />}
            onClick={() => {
              setRenaming(menu.id)
              setRenameValue(menu.name)
              closeMenu()
            }}
          >
            Rename
          </MenuItem>
          {menu.type === "folder" && (
            <MenuItem
              icon={<FolderIcon size={16} weight="fill" />}
              onClick={() => {
                const f = folders.find((x) => x.id === menu.id)
                if (f) setColorEditFolder(f)
                closeMenu()
              }}
            >
              Change color…
            </MenuItem>
          )}
          <MenuItem
            icon={<ShareNetworkIcon size={16} />}
            onClick={() => {
              setShare({
                type: menu.type === "folder" ? "FOLDER" : "FILE",
                id: menu.id,
                name: menu.name,
              })
              closeMenu()
            }}
          >
            Share…
          </MenuItem>
          <MenuItem
            icon={<StarIcon size={16} />}
            onClick={async () => {
              await toggleStarred(menu.type, menu.id)
              closeMenu()
            }}
          >
            Toggle star
          </MenuItem>
          <MenuItem
            icon={<EyeSlashIcon size={16} />}
            onClick={async () => {
              await toggleHiddenItem(menu.type, menu.id)
              closeMenu()
            }}
          >
            Toggle hidden
          </MenuItem>
          <MenuItem
            icon={<TrashIcon size={16} />}
            onClick={async () => {
              await trashItem(menu.type, menu.id)
              closeMenu()
            }}
          >
            Move to trash
          </MenuItem>
          <MenuItem
            icon={<EyeIcon size={16} />}
            onClick={async () => {
              await restoreItem(menu.type, menu.id)
              closeMenu()
            }}
          >
            Restore
          </MenuItem>
          <MenuItem
            icon={<TrashIcon size={16} weight="fill" />}
            danger
            onClick={async () => {
              if (confirm(`Permanently delete "${menu.name}"?`)) await deleteItem(menu.type, menu.id)
              closeMenu()
            }}
          >
            Delete forever
          </MenuItem>
        </ul>
      )}

      {share && (
        <ShareDialog
          open={!!share}
          onClose={() => setShare(null)}
          resourceType={share.type}
          resourceId={share.id}
          resourceName={share.name}
        />
      )}

      <FilePreview file={preview} onClose={() => setPreview(null)} />

      <NewFolderDialog
        open={!!colorEditFolder}
        title="Folder color"
        submitLabel="Save"
        initialName={colorEditFolder?.name ?? ""}
        initialColor={colorEditFolder?.color ?? null}
        onClose={() => setColorEditFolder(null)}
        onSubmit={async (name, color) => {
          if (!colorEditFolder) return
          if (name !== colorEditFolder.name) await renameFolder(colorEditFolder.id, name)
          if ((color ?? null) !== (colorEditFolder.color ?? null))
            await recolorFolder(colorEditFolder.id, color)
        }}
      />
    </div>
  )
}

function StarToggle({
  type,
  id,
  starred,
  className,
}: {
  type: "folder" | "file"
  id: string
  starred: boolean
  className?: string
}) {
  const toggleStarred = useDrive((s) => s.toggleStarred)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!confirmOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setConfirmOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [confirmOpen])

  async function handle(e: React.MouseEvent) {
    e.stopPropagation()
    if (starred) {
      setConfirmOpen((v) => !v)
    } else {
      await toggleStarred(type, id)
    }
  }

  return (
    <div
      ref={ref}
      className={`relative ${className ?? ""}`}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={handle}
        className={`rounded p-1 transition-opacity ${
          starred ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
        }`}
        title={starred ? "Remove star" : "Star"}
        aria-label={starred ? "Remove star" : "Star"}
      >
        <StarIcon
          size={16}
          weight={starred ? "fill" : "regular"}
          className={starred ? "text-yellow-500" : "text-muted-foreground"}
        />
      </button>
      {confirmOpen && (
        <div className="bg-popover text-popover-foreground absolute top-full right-0 z-20 mt-1 w-44 rounded-md border p-2 text-sm shadow-lg">
          <div className="mb-2">Remove from starred?</div>
          <div className="flex justify-end gap-1">
            <button
              onClick={() => setConfirmOpen(false)}
              className="hover:bg-accent rounded px-2 py-1 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await toggleStarred(type, id)
                setConfirmOpen(false)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded px-2 py-1 text-xs"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon?: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left ${
          danger ? "text-destructive hover:text-destructive" : ""
        }`}
      >
        {icon}
        <span>{children}</span>
      </button>
    </li>
  )
}

function GridCard({
  folder,
  selected,
  onClick,
  onDoubleClick,
  onContextMenu,
  renaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: {
  folder: Folder
  selected: boolean
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  renaming: boolean
  renameValue: string
  onRenameChange: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
}) {
  return (
    <div
      className={`group hover:bg-accent/40 relative cursor-pointer rounded-lg transition-colors ${
        selected ? "bg-accent/60 ring-primary/30 ring-2" : ""
      } ${folder.isHidden ? "opacity-60" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <StarToggle
        type="folder"
        id={folder.id}
        starred={folder.isStarred}
        className="absolute top-2 right-2 z-10"
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
        {renaming ? (
          <input
            className="bg-background w-full rounded border px-1 text-sm"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameCommit()
              if (e.key === "Escape") onRenameCancel()
            }}
            onBlur={onRenameCommit}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="truncate text-sm font-medium" title={folder.name}>
            {folder.name}
          </div>
        )}
      </div>
    </div>
  )
}

function GridCardFile({
  file,
  selected,
  onClick,
  onDoubleClick,
  onContextMenu,
  renaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: {
  file: FileItem
  selected: boolean
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  renaming: boolean
  renameValue: string
  onRenameChange: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
}) {
  const isImg = file.mimeType.startsWith("image/")
  return (
    <div
      className={`bg-card group hover:border-primary/60 relative cursor-pointer overflow-visible rounded-lg border transition-colors ${
        selected ? "border-primary ring-primary/30 ring-2" : ""
      } ${file.isHidden ? "opacity-60" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <StarToggle
        type="file"
        id={file.id}
        starred={file.isStarred}
        className="absolute top-2 left-0 z-10 bg-red-500 w-fit"
      />
      <div className="bg-muted grid aspect-4/3 place-items-center overflow-hidden rounded-t-lg">
        {isImg ? (
          <img
            src={apiUrl(`/api/files/${file.id}/download?inline=1`)}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          iconFor(file.mimeType, 36)
        )}
      </div>
      <div className="p-2">
        {renaming ? (
          <input
            className="bg-background w-full rounded border px-1 text-sm"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameCommit()
              if (e.key === "Escape") onRenameCancel()
            }}
            onBlur={onRenameCommit}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </div>
        )}
        <div className="text-muted-foreground text-xs">{formatBytes(file.size)}</div>
      </div>
    </div>
  )
}
