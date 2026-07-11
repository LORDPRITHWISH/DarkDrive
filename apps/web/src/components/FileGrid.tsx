import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowsOutCardinalIcon,
  DownloadIcon,
  StarIcon,
  TrashIcon,
  UsersThreeIcon,
  XIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { useDrive, zoomToGrid } from "@/store/drive"
import type { FileItem, Folder } from "@/lib/types"
import { sortFiles, sortFolders } from "@/lib/sort"
import { triggerDownload } from "@/lib/download"
import { ShareDialog } from "./ShareDialog"
import { FilePreview } from "./FilePreview"
import { MoveDialog } from "./MoveDialog"
import { AddToSpaceDialog } from "./AddToSpaceDialog"
import { FolderPropertiesDialog } from "./FolderPropertiesDialog"
import { FilePropertiesDialog } from "./FilePropertiesDialog"
import { FolderCard } from "./file-grid/FolderCard"
import { FileCard } from "./file-grid/FileCard"
import { FileListView } from "./file-grid/FileListView"
import { FileContextMenu, type MenuPos } from "./file-grid/FileContextMenu"
import { startItemDrag, type DragItem } from "./file-grid/dnd"

export function FileGrid() {
  const {
    currentFolderId,
    folders,
    files,
    view,
    selection,
    sort,
    zoom,
    preview,
    setPreview,
    select,
    selectRange,
    clearSelection,
    trashItems,
    toggleHiddenItem,
    toggleStarred,
    setStarred,
    renameFile,
    renameFolder,
    moveItems,
    removeShortcut,
  } = useDrive()
  const sortedFolders = useMemo(() => sortFolders(folders, sort), [folders, sort])
  const sortedFiles = useMemo(() => sortFiles(files, sort), [files, sort])
  const { minWidth, iconSize } = useMemo(() => zoomToGrid(zoom), [zoom])
  // Same order as what's on screen, so shift-click range-select spans what
  // the user actually sees regardless of grid vs list view.
  const orderedIds = useMemo(
    () => [...sortedFolders.map((f) => f.id), ...sortedFiles.map((f) => f.id)],
    [sortedFolders, sortedFiles]
  )

  function typeOf(id: string): "folder" | "file" {
    return folders.some((f) => f.id === id) ? "folder" : "file"
  }

  function nameOf(id: string): string {
    return folders.find((f) => f.id === id)?.name ?? files.find((f) => f.id === id)?.name ?? ""
  }

  function isStarredId(id: string): boolean {
    return (
      folders.find((f) => f.id === id)?.isStarred ??
      files.find((f) => f.id === id)?.isStarred ??
      false
    )
  }

  const allSelectedStarred = useMemo(
    () => selection.size > 0 && Array.from(selection).every((id) => isStarredId(id)),
    [selection, folders, files]
  )

  function clickSelect(e: React.MouseEvent, id: string) {
    if (e.shiftKey) selectRange(id, orderedIds)
    else select(id, e.metaKey || e.ctrlKey)
  }

  // Dragging a card that's part of an active multi-selection drags the whole
  // selection; dragging an unselected (or lone-selected) card drags just it.
  function dragStart(e: React.DragEvent, type: "folder" | "file", id: string) {
    const items: DragItem[] =
      selection.has(id) && selection.size > 1
        ? Array.from(selection).map((sid) => ({ type: typeOf(sid), id: sid }))
        : [{ type, id }]
    startItemDrag(e, items)
  }

  async function handleMoveDrop(targetFolderId: string, dragged: DragItem[]) {
    if (dragged.length === 0) return
    try {
      await moveItems(dragged, targetFolderId)
    } catch (e) {
      console.error("move failed", e)
    }
  }
  const nav = useNavigate()
  const [menu, setMenu] = useState<MenuPos | null>(null)
  const [share, setShare] = useState<
    { type: "FILE" | "FOLDER"; id: string; name: string } | null
  >(null)
  const [propertiesFolder, setPropertiesFolder] = useState<Folder | null>(null)
  const [propertiesFile, setPropertiesFile] = useState<FileItem | null>(null)
  const [moveTarget, setMoveTarget] = useState<
    | {
        items: DragItem[]
        displayName: string
        currentParentId: string | null
      }
    | null
  >(null)

  // Right-clicking (or bulk-actioning) a card that's part of an active
  // multi-selection targets the whole selection; otherwise just that item.
  function selectionOrSingle(id: string): string[] {
    return selection.has(id) && selection.size > 1 ? Array.from(selection) : [id]
  }

  function openMoveDialog(type: "folder" | "file", id: string, name: string) {
    const ids = selectionOrSingle(id)
    setMoveTarget({
      items: ids.map((sid) => ({ type: sid === id ? type : typeOf(sid), id: sid })),
      displayName: ids.length === 1 ? name : `${ids.length} items`,
      currentParentId: currentFolderId,
    })
  }
  const [addTarget, setAddTarget] = useState<
    { items: DragItem[]; displayName: string } | null
  >(null)

  function openAddToSpaceDialog(type: "folder" | "file", id: string, name: string) {
    const ids = selectionOrSingle(id)
    setAddTarget({
      items: ids.map((sid) => ({ type: sid === id ? type : typeOf(sid), id: sid })),
      displayName: ids.length === 1 ? name : `${ids.length} items`,
    })
  }
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  function openMenu(
    e: React.MouseEvent,
    type: "folder" | "file",
    id: string,
    name: string
  ) {
    e.preventDefault()
    e.stopPropagation()
    const shortcutId =
      type === "file" ? files.find((x) => x.id === id)?.shortcutId : undefined
    const hasThumbnail =
      type === "folder" ? !!folders.find((x) => x.id === id)?.thumbnailKey : undefined
    setMenu({ x: e.clientX, y: e.clientY, type, id, name, shortcutId, hasThumbnail })
  }
  const closeMenu = () => setMenu(null)

  async function doRename(type: "folder" | "file", id: string) {
    if (!renameValue.trim()) return setRenaming(null)
    if (type === "folder") await renameFolder(id, renameValue.trim())
    else await renameFile(id, renameValue.trim())
    setRenaming(null)
  }

  if (folders.length === 0 && files.length === 0) {
    return (
      <div className="text-muted-foreground grid h-full place-items-center text-sm">
        This folder is empty. Drag files in or use Upload.
      </div>
    )
  }

  return (
    <div onClick={closeMenu}>
      {selection.size > 0 && (
        <div className="bg-card sticky top-0 z-20 mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm">
          <span className="font-medium">{selection.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const ids = Array.from(selection)
              triggerDownload(
                ids.map((id) => ({ type: typeOf(id), id })),
                ids.length === 1 ? nameOf(ids[0]) : `${ids.length} items`
              )
            }}
          >
            <DownloadIcon size={14} />
            Download
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const [firstId] = selection
              if (firstId) openMoveDialog(typeOf(firstId), firstId, nameOf(firstId))
            }}
          >
            <ArrowsOutCardinalIcon size={14} />
            Move to…
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const ids = Array.from(selection)
              // If everything selected is already starred, unstar the batch;
              // otherwise star the ones that aren't yet (matches Drive's toggle feel).
              void setStarred(
                ids.map((id) => ({ type: typeOf(id), id })),
                !allSelectedStarred
              )
            }}
          >
            <StarIcon size={14} />
            {allSelectedStarred ? "Unstar" : "Star"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const [firstId] = selection
              if (firstId) openAddToSpaceDialog(typeOf(firstId), firstId, nameOf(firstId))
            }}
          >
            <UsersThreeIcon size={14} />
            Add to space…
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const ids = Array.from(selection).map((id) => ({ type: typeOf(id), id }))
              clearSelection()
              void trashItems(ids)
            }}
          >
            <TrashIcon size={14} />
            Delete
          </Button>
          <button
            onClick={clearSelection}
            className="text-muted-foreground hover:text-foreground ml-auto rounded p-1"
            title="Clear selection"
            aria-label="Clear selection"
          >
            <XIcon size={16} />
          </button>
        </div>
      )}
      {view === "grid" ? (
        <div
          className="grid gap-3 p-2"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
          }}
        >
          {sortedFolders.map((f) => (
            <FolderCard
              key={f.id}
              folder={f}
              selected={selection.has(f.id)}
              iconSize={iconSize}
              onClick={(e) => clickSelect(e, f.id)}
              onDoubleClick={() => nav(`/drive/${f.id}`)}
              onContextMenu={(e) => openMenu(e, "folder", f.id, f.name)}
              onDragStart={(e) => dragStart(e, "folder", f.id)}
              onMoveDrop={handleMoveDrop}
              renaming={renaming === f.id}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              onRenameCommit={() => doRename("folder", f.id)}
              onRenameCancel={() => setRenaming(null)}
            />
          ))}
          {sortedFiles.map((f) => (
            <FileCard
              key={f.id}
              file={f}
              selected={selection.has(f.id)}
              iconSize={iconSize}
              onClick={(e) => clickSelect(e, f.id)}
              onDoubleClick={() => setPreview(f)}
              onContextMenu={(e) => openMenu(e, "file", f.id, f.name)}
              onDragStart={(e) => dragStart(e, "file", f.id)}
              renaming={renaming === f.id}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              onRenameCommit={() => doRename("file", f.id)}
              onRenameCancel={() => setRenaming(null)}
            />
          ))}
        </div>
      ) : (
        <FileListView
          folders={sortedFolders}
          files={sortedFiles}
          selection={selection}
          onSelect={(id, e) => clickSelect(e, id)}
          onOpenFolder={(id) => nav(`/drive/${id}`)}
          onOpenFile={(f) => setPreview(f)}
          onMenu={openMenu}
          onDragStart={dragStart}
          onMoveDrop={handleMoveDrop}
        />
      )}

      {menu && (
        <FileContextMenu
          menu={menu}
          onOpen={() => {
            const f = files.find((x) => x.id === menu.id)
            if (f) setPreview(f)
            closeMenu()
          }}
          onProperties={() => {
            const f = files.find((x) => x.id === menu.id)
            if (f) setPropertiesFile(f)
            closeMenu()
          }}
          onDownload={() => {
            const ids = selectionOrSingle(menu.id)
            triggerDownload(
              ids.map((id) => ({ type: id === menu.id ? menu.type : typeOf(id), id })),
              ids.length === 1 ? menu.name : `${ids.length} items`
            )
            closeMenu()
          }}
          onRename={() => {
            setRenaming(menu.id)
            setRenameValue(menu.name)
            closeMenu()
          }}
          onMove={() => {
            openMoveDialog(menu.type, menu.id, menu.name)
            closeMenu()
          }}
          onFolderProperties={() => {
            const f = folders.find((x) => x.id === menu.id)
            if (f) setPropertiesFolder(f)
            closeMenu()
          }}
          onShare={() => {
            setShare({
              type: menu.type === "folder" ? "FOLDER" : "FILE",
              id: menu.id,
              name: menu.name,
            })
            closeMenu()
          }}
          onToggleStar={async () => {
            await toggleStarred(menu.type, menu.id)
            closeMenu()
          }}
          onToggleHidden={async () => {
            await toggleHiddenItem(menu.type, menu.id)
            closeMenu()
          }}
          onDelete={async () => {
            const ids = selectionOrSingle(menu.id)
            closeMenu()
            clearSelection()
            await trashItems(ids.map((id) => ({ type: id === menu.id ? menu.type : typeOf(id), id })))
          }}
          onRemoveShortcut={async () => {
            if (menu.shortcutId) await removeShortcut(menu.shortcutId)
            closeMenu()
          }}
          onAddToSpace={() => {
            openAddToSpaceDialog(menu.type, menu.id, menu.name)
            closeMenu()
          }}
        />
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

      <FilePreview
        file={preview}
        onClose={() => setPreview(null)}
        items={sortedFiles}
        onNavigate={setPreview}
      />

      {addTarget && (
        <AddToSpaceDialog
          open={!!addTarget}
          items={addTarget.items}
          displayName={addTarget.displayName}
          onClose={() => setAddTarget(null)}
        />
      )}

      {moveTarget && (
        <MoveDialog
          open={!!moveTarget}
          items={moveTarget.items}
          displayName={moveTarget.displayName}
          currentParentId={moveTarget.currentParentId}
          onClose={() => setMoveTarget(null)}
          onSubmit={async (targetFolderId) => {
            await moveItems(moveTarget.items, targetFolderId)
          }}
        />
      )}

      <FolderPropertiesDialog
        folder={propertiesFolder}
        onClose={() => setPropertiesFolder(null)}
      />

      <FilePropertiesDialog
        file={propertiesFile}
        onClose={() => setPropertiesFile(null)}
      />
    </div>
  )
}
