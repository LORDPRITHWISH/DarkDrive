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
import { HoverName } from "@/components/HoverName"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

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
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="p-0 py-2 pl-4">Name</TableHead>
          <TableHead className="p-0 py-2">Modified</TableHead>
          <TableHead className="p-0 py-2">Size</TableHead>
          <TableHead className="p-0 py-2 pr-4" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {folders.map((f) => (
          <TableRow
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
            className={`cursor-pointer ${selection.has(f.id) ? "bg-accent/60" : ""} ${
              dropId === f.id ? "ring-primary ring-inset ring-2" : ""
            }`}
            onClick={(e) => onSelect(f.id, e)}
            onDoubleClick={() => onOpenFolder(f.id)}
            onContextMenu={(e) => onMenu(e, "folder", f.id, f.name)}
          >
            <TableCell className="p-0 py-2 pl-4">
              <div className="flex items-center gap-2">
                <FolderIcon
                  size={20}
                  weight="fill"
                  style={{ color: f.color || undefined }}
                  className={f.color ? "" : "text-primary"}
                />
                <HoverName
                  as="span"
                  name={f.name}
                  className={`min-w-0 truncate ${f.isHidden ? "opacity-60 italic" : ""}`}
                />
                {f.isStarred && (
                  <StarIcon size={14} weight="fill" className="text-yellow-500" />
                )}
              </div>
            </TableCell>
            <TableCell className="p-0 py-2">{formatDate(f.updatedAt)}</TableCell>
            <TableCell className="p-0 py-2">—</TableCell>
            <TableCell className="p-0 py-2 pr-4 text-right">
              <button
                onClick={(e) => onMenu(e, "folder", f.id, f.name)}
                className="hover:bg-accent rounded p-1"
              >
                <DotsThreeIcon size={16} />
              </button>
            </TableCell>
          </TableRow>
        ))}
        {files.map((f) => (
          <TableRow
            key={f.id}
            draggable
            onDragStart={(e) => onDragStart(e, "file", f.id)}
            className={`cursor-pointer ${selection.has(f.id) ? "bg-accent/60" : ""}`}
            onClick={(e) => onSelect(f.id, e)}
            onDoubleClick={() => onOpenFile(f)}
            onContextMenu={(e) => onMenu(e, "file", f.id, f.name)}
          >
            <TableCell className="p-0 py-2 pl-4">
              <div className="flex items-center gap-2">
                <span className="grid size-5 shrink-0 place-items-center overflow-hidden rounded">
                  <FileThumb file={f} iconSize={20} />
                </span>
                <HoverName
                  as="span"
                  name={f.name}
                  className={`min-w-0 truncate ${f.isHidden ? "opacity-60 italic" : ""}`}
                />
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
            </TableCell>
            <TableCell className="p-0 py-2">{formatDate(f.updatedAt)}</TableCell>
            <TableCell className="p-0 py-2">{formatBytes(f.size)}</TableCell>
            <TableCell className="p-0 py-2 pr-4 text-right">
              <button
                onClick={(e) => onMenu(e, "file", f.id, f.name)}
                className="hover:bg-accent rounded p-1"
              >
                <DotsThreeIcon size={16} />
              </button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
