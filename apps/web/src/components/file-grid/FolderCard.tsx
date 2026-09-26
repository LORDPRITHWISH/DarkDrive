import { useState } from "react"
import { ArrowsClockwiseIcon, FolderIcon } from "@phosphor-icons/react"
import { Input } from "@workspace/ui/components/input"
import type { Folder } from "@/lib/types"
import { apiUrl } from "@/lib/config"
import { StarToggle } from "./StarToggle"
import { isInternalDrag, readItemDrag, type DragItem } from "./dnd"
import { HoverName } from "@/components/HoverName"
import { useAuth } from "@/store/auth"

// The folder icon, badged on the folders the desktop app syncs (the direct
// children of "Synced Folders"): they mirror a folder on someone's computer
// rather than being made here.
export function FolderGlyph({ folder, size }: { folder: Folder; size: number }) {
  const synced = useAuth((s) => !!s.user && s.user.syncRootFolderId === folder.parentId)
  return (
    <span className="relative inline-flex shrink-0">
      <FolderIcon
        size={size}
        weight="fill"
        style={{ color: folder.color || undefined }}
        className={folder.color ? "" : "text-primary"}
      />
      {synced && (
        <span
          className="bg-background text-primary absolute right-0 bottom-0 grid place-items-center rounded-full p-[6%]"
          title="Synced with a computer"
        >
          <ArrowsClockwiseIcon size={Math.max(8, Math.round(size * 0.35))} weight="bold" />
        </span>
      )}
    </span>
  )
}

function FolderThumb({ folderId }: { folderId: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img
      src={apiUrl(`/api/folders/${folderId}/thumbnail`)}
      alt=""
      loading="lazy"
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  )
}

export function FolderCard({
  folder,
  selected,
  iconSize = 72,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onMoveDrop,
  renaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  mine,
}: {
  folder: Folder
  selected: boolean
  iconSize?: number
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onMoveDrop: (targetFolderId: string, dragged: DragItem[]) => void
  renaming: boolean
  renameValue: string
  onRenameChange: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  // See FileCard — only set inside a space, true when the viewer owns it.
  mine?: boolean
}) {
  const [dragOver, setDragOver] = useState(false)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      draggable
      onDragStart={(e) => {
        onDragStart(e)
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => {
        if (!isInternalDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        const payload = readItemDrag(e)
        if (!payload || payload.length === 0) return
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        if (payload.every((p) => p.type === "folder" && p.id === folder.id)) return
        onMoveDrop(
          folder.id,
          payload.filter((p) => !(p.type === "folder" && p.id === folder.id))
        )
      }}
      className={`group hover:bg-accent/30 relative cursor-pointer rounded-lg transition-colors ${
        selected ? "bg-accent/60 ring-primary/30 ring-2" : ""
      } ${dragOver ? "ring-primary ring-2" : ""} ${dragging ? "opacity-40" : ""} ${folder.isHidden ? "opacity-60" : ""}`}
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
      {mine && (
        <span
          className="bg-primary/15 text-primary absolute top-2 left-2 z-10 rounded-full px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur"
          title="Owned by you"
        >
          You
        </span>
      )}
      <div className="relative grid aspect-4/3 place-items-center overflow-hidden rounded-lg">
        {folder.thumbnailKey ? (
          <>
            <FolderThumb folderId={folder.id} />
            <div className="bg-background/80 absolute right-2 bottom-2 z-10 rounded-md p-1 backdrop-blur-sm">
              <FolderGlyph folder={folder} size={16} />
            </div>
          </>
        ) : (
          <FolderGlyph folder={folder} size={iconSize} />
        )}
      </div>
      <div className="px-2 pb-2">
        {renaming ? (
          <Input
            className="h-7 rounded-md px-1 text-sm"
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
          <HoverName
            as="div"
            name={folder.name}
            className="truncate text-center text-sm font-medium"
          />
        )}
      </div>
    </div>
  )
}
