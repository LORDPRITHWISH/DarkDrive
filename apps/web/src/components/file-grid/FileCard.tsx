import { useState } from "react"
import { LinkSimpleIcon } from "@phosphor-icons/react"
import type { FileItem } from "@/lib/types"
import { formatBytes } from "@/lib/format"
import { iconFor } from "@/lib/fileIcon"
import { thumbnailable } from "@/lib/thumb"
import { StarToggle } from "./StarToggle"
import { FileThumb } from "./FileThumb"

export function FileCard({
  file,
  selected,
  iconSize = 72,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  renaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: {
  file: FileItem
  selected: boolean
  iconSize?: number
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  renaming: boolean
  renameValue: string
  onRenameChange: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
}) {
  const [dragging, setDragging] = useState(false)
  return (
    <div
      draggable
      onDragStart={(e) => {
        onDragStart(e)
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      className={`group hover:bg-accent/40 relative cursor-pointer overflow-visible rounded-lg transition-colors ${
        selected ? "bg-accent/60 ring-primary/30 ring-2" : ""
      } ${dragging ? "opacity-40" : ""} ${file.isHidden ? "opacity-60" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <StarToggle
        type="file"
        id={file.id}
        starred={file.isStarred}
        className="absolute top-2 right-0 z-10 w-fit"
      />
      {file.isShortcut && (
        <div
          className="bg-background/80 absolute top-2 left-2 z-10 rounded-full p-1 backdrop-blur"
          title="Shortcut — primary file lives in the uploader's drive"
        >
          <LinkSimpleIcon size={12} />
        </div>
      )}
      <div className="relative grid aspect-4/3 place-items-center overflow-hidden rounded-lg">
        <FileThumb file={file} iconSize={iconSize} />
        {thumbnailable(file) && (
          <div className="bg-background/80 absolute right-2 bottom-2 z-10 rounded-md p-1 backdrop-blur-sm">
            {iconFor(file.mimeType, 16, file.name)}
          </div>
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
