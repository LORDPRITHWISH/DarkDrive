import { useState } from "react"
import {
  DotsThreeIcon,
  FolderIcon,
  LinkSimpleIcon,
  StarIcon,
} from "@phosphor-icons/react"
import type { FileItem, Folder } from "@/lib/types"
import { formatBytes, formatDate } from "@/lib/format"
import { FileThumb } from "./FileThumb"
import { isInternalDrag, readItemDrag, type DragItem } from "./dnd"

type ItemType = "folder" | "file"

type Props = {
  folders: Folder[]
  files: FileItem[]
  selection: Set<string>
  onSelect: (id: string, e: React.MouseEvent) => void
  onOpenFolder: (id: string) => void
  onOpenFile: (file: FileItem) => void
  onMenu: (e: React.MouseEvent, type: ItemType, id: string, name: string) => void
  onDragStart: (e: React.DragEvent, type: ItemType, id: string) => void
  onMoveDrop: (targetFolderId: string, dragged: DragItem[]) => void
}

export function FileListView({
  folders,
  files,
  selection,
  onSelect,
  onOpenFolder,
  onOpenFile,
  onMenu,
  onDragStart,
  onMoveDrop,
}: Props) {
  const [dropId, setDropId] = useState<string | null>(null)
  return (
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
            draggable
            onDragStart={(e) => onDragStart(e, "folder", f.id)}
            onDragOver={(e) => {
              if (!isInternalDrag(e)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = "move"
              setDropId(f.id)
            }}
            onDragLeave={() => setDropId((cur) => (cur === f.id ? null : cur))}
            onDrop={(e) => {
              const payload = readItemDrag(e)
              if (!payload || payload.length === 0) return
              e.preventDefault()
              e.stopPropagation()
              setDropId(null)
              if (payload.every((p) => p.type === "folder" && p.id === f.id)) return
              onMoveDrop(
                f.id,
                payload.filter((p) => !(p.type === "folder" && p.id === f.id))
              )
            }}
            className={`hover:bg-accent/40 cursor-pointer border-b ${
              selection.has(f.id) ? "bg-accent/60" : ""
            } ${dropId === f.id ? "ring-primary ring-inset ring-2" : ""}`}
            onClick={(e) => onSelect(f.id, e)}
            onDoubleClick={() => onOpenFolder(f.id)}
            onContextMenu={(e) => onMenu(e, "folder", f.id, f.name)}
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
                {f.isStarred && (
                  <StarIcon size={14} weight="fill" className="text-yellow-500" />
                )}
              </div>
            </td>
            <td className="py-2">{formatDate(f.updatedAt)}</td>
            <td className="py-2">—</td>
            <td className="py-2 pr-4 text-right">
              <button
                onClick={(e) => onMenu(e, "folder", f.id, f.name)}
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
            draggable
            onDragStart={(e) => onDragStart(e, "file", f.id)}
            className={`hover:bg-accent/40 cursor-pointer border-b ${
              selection.has(f.id) ? "bg-accent/60" : ""
            }`}
            onClick={(e) => onSelect(f.id, e)}
            onDoubleClick={() => onOpenFile(f)}
            onContextMenu={(e) => onMenu(e, "file", f.id, f.name)}
          >
            <td className="py-2 pl-4">
              <div className="flex items-center gap-2">
                <span className="grid size-5 shrink-0 place-items-center overflow-hidden rounded">
                  <FileThumb file={f} iconSize={20} />
                </span>
                <span className={f.isHidden ? "opacity-60 italic" : ""}>{f.name}</span>
                {f.isStarred && (
                  <StarIcon size={14} weight="fill" className="text-yellow-500" />
                )}
                {f.isShortcut && (
                  <LinkSimpleIcon
                    size={14}
                    className="text-muted-foreground"
                    aria-label="Shortcut"
                  />
                )}
              </div>
            </td>
            <td className="py-2">{formatDate(f.updatedAt)}</td>
            <td className="py-2">{formatBytes(f.size)}</td>
            <td className="py-2 pr-4 text-right">
              <button
                onClick={(e) => onMenu(e, "file", f.id, f.name)}
                className="hover:bg-accent rounded p-1"
              >
                <DotsThreeIcon size={16} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
