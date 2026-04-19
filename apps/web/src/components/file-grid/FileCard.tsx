import { useState } from "react"
import { LinkSimpleIcon } from "@phosphor-icons/react"
import type { FileItem } from "@/lib/types"
import { formatBytes } from "@/lib/format"
import { apiUrl } from "@/lib/config"
import { iconFor } from "@/lib/fileIcon"
import { StarToggle } from "./StarToggle"
import { startItemDrag } from "./dnd"

export function FileCard({
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
  const [dragging, setDragging] = useState(false)
  return (
    <div
      draggable
      onDragStart={(e) => {
        startItemDrag(e, { type: "file", id: file.id })
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      className={`bg-card group hover:border-primary/60 relative cursor-pointer overflow-visible rounded-lg border transition-colors ${
        selected ? "border-primary ring-primary/30 ring-2" : ""
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
