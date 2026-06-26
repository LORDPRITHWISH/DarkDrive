import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useDrive, zoomToGrid } from "@/store/drive"
import type { FileItem, Folder } from "@/lib/types"
import { apiUrl } from "@/lib/config"
import { sortFiles, sortFolders } from "@/lib/sort"
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

export function FileGrid() {
  const {
    folders,
    files,
    view,
    selection,
    sort,
    zoom,
    preview,
    setPreview,
    select,
    trashItem,
    toggleHiddenItem,
    toggleStarred,
    renameFile,
    renameFolder,
    moveItem,
    removeShortcut,
  } = useDrive()
  const sortedFolders = useMemo(() => sortFolders(folders, sort), [folders, sort])
  const sortedFiles = useMemo(() => sortFiles(files, sort), [files, sort])
  const { minWidth, iconSize } = useMemo(() => zoomToGrid(zoom), [zoom])

  async function handleMoveDrop(
    targetFolderId: string,
    dragged: { type: "folder" | "file"; id: string }
  ) {
    if (dragged.type === "folder" && dragged.id === targetFolderId) return
    try {
      await moveItem(dragged.type, dragged.id, targetFolderId)
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
        type: "folder" | "file"
        id: string
        name: string
        currentParentId: string | null
      }
    | null
  >(null)
  const [addTarget, setAddTarget] = useState<
    { type: "folder" | "file"; id: string; name: string } | null
  >(null)
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
              onClick={(e) => select(f.id, e.metaKey || e.ctrlKey || e.shiftKey)}
              onDoubleClick={() => nav(`/drive/${f.id}`)}
              onContextMenu={(e) => openMenu(e, "folder", f.id, f.name)}
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
              onClick={(e) => select(f.id, e.metaKey || e.ctrlKey || e.shiftKey)}
              onDoubleClick={() => setPreview(f)}
              onContextMenu={(e) => openMenu(e, "file", f.id, f.name)}
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
          onSelect={(id, e) => select(id, e.metaKey || e.ctrlKey || e.shiftKey)}
          onOpenFolder={(id) => nav(`/drive/${id}`)}
          onOpenFile={(f) => setPreview(f)}
          onMenu={openMenu}
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
            window.open(apiUrl(`/api/files/${menu.id}/download`), "_blank")
            closeMenu()
          }}
          onRename={() => {
            setRenaming(menu.id)
            setRenameValue(menu.name)
            closeMenu()
          }}
          onMove={() => {
            if (menu.type === "folder") {
              const f = folders.find((x) => x.id === menu.id)
              if (f)
                setMoveTarget({
                  type: "folder",
                  id: f.id,
                  name: f.name,
                  currentParentId: f.parentId,
                })
            } else {
              const f = files.find((x) => x.id === menu.id)
              if (f)
                setMoveTarget({
                  type: "file",
                  id: f.id,
                  name: f.name,
                  currentParentId: f.folderId,
                })
            }
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
            await trashItem(menu.type, menu.id)
            closeMenu()
          }}
          onRemoveShortcut={async () => {
            if (menu.shortcutId) await removeShortcut(menu.shortcutId)
            closeMenu()
          }}
          onAddToSpace={() => {
            setAddTarget({ type: menu.type, id: menu.id, name: menu.name })
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

      <FilePreview file={preview} onClose={() => setPreview(null)} />

      {addTarget && (
        <AddToSpaceDialog
          open={!!addTarget}
          itemType={addTarget.type}
          itemId={addTarget.id}
          itemName={addTarget.name}
          onClose={() => setAddTarget(null)}
        />
      )}

      {moveTarget && (
        <MoveDialog
          open={!!moveTarget}
          itemType={moveTarget.type}
          itemId={moveTarget.id}
          itemName={moveTarget.name}
          currentParentId={moveTarget.currentParentId}
          onClose={() => setMoveTarget(null)}
          onSubmit={async (targetFolderId) => {
            await moveItem(moveTarget.type, moveTarget.id, targetFolderId)
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
