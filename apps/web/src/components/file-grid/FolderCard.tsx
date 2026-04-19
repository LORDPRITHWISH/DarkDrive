import { useState } from "react"
import { FolderIcon } from "@phosphor-icons/react"
import type { Folder } from "@/lib/types"
import { StarToggle } from "./StarToggle"
import { isInternalDrag, readItemDrag, startItemDrag } from "./dnd"

export function FolderCard({
  folder,
  selected,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMoveDrop,
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
  onMoveDrop: (
    targetFolderId: string,
    dragged: { type: "folder" | "file"; id: string }
  ) => void
  renaming: boolean
  renameValue: string
  onRenameChange: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      draggable
      onDragStart={(e) => {
        startItemDrag(e, { type: "folder", id: folder.id })
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
        if (!payload) return
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        if (payload.type === "folder" && payload.id === folder.id) return
        onMoveDrop(folder.id, payload)
      }}
      className={`group hover:bg-accent/40 relative cursor-pointer rounded-lg transition-colors ${
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
