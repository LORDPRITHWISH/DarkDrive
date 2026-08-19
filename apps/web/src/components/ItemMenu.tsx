import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useDrive } from "@/store/drive"
import { triggerDownload } from "@/lib/download"
import type { FileItem, Folder } from "@/lib/types"
import { FileContextMenu, type MenuPos } from "./file-grid/FileContextMenu"
import { ShareDialog } from "./ShareDialog"
import { MoveDialog } from "./MoveDialog"
import { AddToSpaceDialog } from "./AddToSpaceDialog"
import { FilePropertiesDialog } from "./FilePropertiesDialog"
import { FolderPropertiesDialog } from "./FolderPropertiesDialog"

type Menu = MenuPos & { record: FileItem | Folder; locationId: string | null }

// Right-click menu for the flat listing pages (Recent, Uploads, Search,
// Starred). Those pages own their own list, so the store's folder-scoped
// actions (rename-in-place, extract, hidden toggle) don't apply — what's left
// is everything that works on an item by id, plus "Open location" to jump to
// where it actually lives. `onChanged` reloads the host page's list after an
// action that can drop an item out of it (star, trash, move).
export function useItemMenu({
  onPreview,
  onChanged,
}: {
  onPreview?: (file: FileItem) => void
  onChanged?: () => void
}) {
  const nav = useNavigate()
  const setStarred = useDrive((s) => s.setStarred)
  const trashItems = useDrive((s) => s.trashItems)
  const moveItems = useDrive((s) => s.moveItems)

  const [menu, setMenu] = useState<Menu | null>(null)
  const [share, setShare] = useState<{ type: "FILE" | "FOLDER"; id: string; name: string } | null>(null)
  const [moveTarget, setMoveTarget] = useState<
    { type: "folder" | "file"; id: string; name: string; parentId: string | null } | null
  >(null)
  const [addTarget, setAddTarget] = useState<{ type: "folder" | "file"; id: string; name: string } | null>(null)
  const [fileProps, setFileProps] = useState<FileItem | null>(null)
  const [folderProps, setFolderProps] = useState<Folder | null>(null)

  function openMenu(e: React.MouseEvent, type: "folder" | "file", record: FileItem | Folder) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      type,
      id: record.id,
      name: record.name,
      isStarred: record.isStarred,
      record,
      locationId: type === "file" ? (record as FileItem).folderId : (record as Folder).parentId,
    })
  }
  const closeMenu = () => setMenu(null)

  const itemMenu = (
    <>
      {menu && (
        <FileContextMenu
          menu={menu}
          onClose={closeMenu}
          onOpen={
            menu.type === "file" && onPreview
              ? () => {
                  onPreview(menu.record as FileItem)
                  closeMenu()
                }
              : undefined
          }
          onOpenLocation={
            menu.locationId
              ? () => {
                  nav(`/drive/${menu.locationId}`)
                  closeMenu()
                }
              : undefined
          }
          onProperties={() => {
            setFileProps(menu.record as FileItem)
            closeMenu()
          }}
          onFolderProperties={() => {
            setFolderProps(menu.record as Folder)
            closeMenu()
          }}
          onDownload={() => {
            triggerDownload([{ type: menu.type, id: menu.id }], menu.name)
            closeMenu()
          }}
          onMove={() => {
            setMoveTarget({ type: menu.type, id: menu.id, name: menu.name, parentId: menu.locationId })
            closeMenu()
          }}
          onAddToSpace={() => {
            setAddTarget({ type: menu.type, id: menu.id, name: menu.name })
            closeMenu()
          }}
          onShare={() => {
            setShare({ type: menu.type === "folder" ? "FOLDER" : "FILE", id: menu.id, name: menu.name })
            closeMenu()
          }}
          onToggleStar={async () => {
            closeMenu()
            await setStarred([{ type: menu.type, id: menu.id }], !menu.isStarred)
            onChanged?.()
          }}
          onDelete={async () => {
            closeMenu()
            await trashItems([{ type: menu.type, id: menu.id }])
            onChanged?.()
          }}
        />
      )}

      {share && (
        <ShareDialog
          open
          onClose={() => setShare(null)}
          resourceType={share.type}
          resourceId={share.id}
          resourceName={share.name}
        />
      )}

      {moveTarget && (
        <MoveDialog
          open
          items={[{ type: moveTarget.type, id: moveTarget.id }]}
          displayName={moveTarget.name}
          currentParentId={moveTarget.parentId}
          onClose={() => setMoveTarget(null)}
          onSubmit={async (targetFolderId) => {
            await moveItems([{ type: moveTarget.type, id: moveTarget.id }], targetFolderId)
            onChanged?.()
          }}
        />
      )}

      {addTarget && (
        <AddToSpaceDialog
          open
          items={[{ type: addTarget.type, id: addTarget.id }]}
          displayName={addTarget.name}
          onClose={() => setAddTarget(null)}
        />
      )}

      <FilePropertiesDialog
        file={fileProps}
        onClose={() => {
          setFileProps(null)
          onChanged?.()
        }}
      />
      <FolderPropertiesDialog
        folder={folderProps}
        onClose={() => {
          setFolderProps(null)
          onChanged?.()
        }}
      />
    </>
  )

  return { openMenu, itemMenu }
}
