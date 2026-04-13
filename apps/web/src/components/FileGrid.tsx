import { useState } from "react"
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
} from "@phosphor-icons/react"
import { useDrive } from "@/store/drive"
import type { FileItem, Folder } from "@/lib/types"
import { formatBytes, formatDate } from "@/lib/format"
import { ShareDialog } from "./ShareDialog"

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
  } = useDrive()
  const nav = useNavigate()
  const [menu, setMenu] = useState<Menu>(null)
  const [share, setShare] = useState<{ type: "FILE" | "FOLDER"; id: string; name: string } | null>(
    null
  )
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
              onDoubleClick={() =>
                window.open(`/api/files/${f.id}/download?inline=1`, "_blank")
              }
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
                    <FolderIcon size={20} weight="fill" className="text-primary" />
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
                onDoubleClick={() =>
                  window.open(`/api/files/${f.id}/download?inline=1`, "_blank")
                }
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
            <MenuItem
              icon={<DownloadIcon size={16} />}
              onClick={() => {
                window.open(`/api/files/${menu.id}/download`, "_blank")
                closeMenu()
              }}
            >
              Download
            </MenuItem>
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
      className={`bg-card group hover:border-primary/60 cursor-pointer rounded-lg border p-3 transition-colors ${
        selected ? "border-primary ring-primary/30 ring-2" : ""
      } ${folder.isHidden ? "opacity-60" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div className="flex items-center justify-between">
        <FolderIcon size={28} weight="fill" className="text-primary" />
        {folder.isStarred && <StarIcon size={14} weight="fill" className="text-yellow-500" />}
      </div>
      {renaming ? (
        <input
          className="bg-background mt-2 w-full rounded border px-1 text-sm"
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
        <div className="mt-2 truncate text-sm font-medium" title={folder.name}>
          {folder.name}
        </div>
      )}
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
      className={`bg-card group hover:border-primary/60 cursor-pointer overflow-hidden rounded-lg border transition-colors ${
        selected ? "border-primary ring-primary/30 ring-2" : ""
      } ${file.isHidden ? "opacity-60" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div className="bg-muted grid aspect-[4/3] place-items-center overflow-hidden">
        {isImg ? (
          <img
            src={`/api/files/${file.id}/download?inline=1`}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          iconFor(file.mimeType, 36)
        )}
      </div>
      <div className="p-2">
        <div className="flex items-center justify-between gap-1">
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
          {file.isStarred && <StarIcon size={14} weight="fill" className="text-yellow-500" />}
        </div>
        <div className="text-muted-foreground text-xs">{formatBytes(file.size)}</div>
      </div>
    </div>
  )
}
