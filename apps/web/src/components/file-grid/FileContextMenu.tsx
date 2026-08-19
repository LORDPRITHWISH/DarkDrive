import {
  ArrowsOutCardinalIcon,
  DownloadIcon,
  EyeIcon as OpenEyeIcon,
  EyeSlashIcon,
  FileZipIcon,
  InfoIcon,
  LinkBreakIcon,
  MapPinIcon,
  PencilSimpleIcon,
  ShareNetworkIcon,
  StarIcon,
  TrashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu"

export type MenuPos = {
  x: number
  y: number
  type: "folder" | "file"
  id: string
  name: string
  shortcutId?: string
  hasThumbnail?: boolean
  // Only known outside the drive grid (Recent/Uploads/Search/Starred pass the
  // record they rendered) — undefined falls back to a "Toggle star" label.
  isStarred?: boolean
}

// Every action is optional: an entry renders only where its host passes a
// handler, so the drive grid gets the full menu while the flat listing pages
// get the subset that makes sense without a current folder.
type Props = {
  menu: MenuPos
  onClose: () => void
  onOpen?: () => void
  onOpenLocation?: () => void
  onProperties?: () => void
  onExtract?: () => void
  onDownload?: () => void
  onRename?: () => void
  onMove?: () => void
  onFolderProperties?: () => void
  onShare?: () => void
  onToggleStar?: () => void
  onToggleHidden?: () => void
  onDelete?: () => void
  onRemoveShortcut?: () => void
  onAddToSpace?: () => void
}

export function FileContextMenu({
  menu,
  onClose,
  onOpen,
  onOpenLocation,
  onProperties,
  onExtract,
  onDownload,
  onRename,
  onMove,
  onFolderProperties,
  onShare,
  onToggleStar,
  onToggleHidden,
  onDelete,
  onRemoveShortcut,
  onAddToSpace,
}: Props) {
  const isShortcut = !!menu.shortcutId
  const isZip = menu.type === "file" && /\.zip$/i.test(menu.name)
  return (
    <DropdownMenu open onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuContent
        // Anchor the menu to the click point rather than an element; the
        // positioner then flips it away from viewport edges for free.
        anchor={{
          getBoundingClientRect: () =>
            new DOMRect(menu.x, menu.y, 0, 0),
        }}
        align="start"
        side="bottom"
        sideOffset={0}
        className="w-56"
      >
        {menu.type === "file" && (
          <>
            {onOpen && (
              <DropdownMenuItem onClick={onOpen}>
                <OpenEyeIcon size={16} />
                Open
              </DropdownMenuItem>
            )}
            {onProperties && (
              <DropdownMenuItem onClick={onProperties}>
                <InfoIcon size={16} />
                Properties
              </DropdownMenuItem>
            )}
            {isZip && onExtract && (
              <DropdownMenuItem onClick={onExtract}>
                <FileZipIcon size={16} />
                Extract here
              </DropdownMenuItem>
            )}
          </>
        )}
        {menu.type === "folder" && !isShortcut && onFolderProperties && (
          <DropdownMenuItem onClick={onFolderProperties}>
            <InfoIcon size={16} />
            Properties…
          </DropdownMenuItem>
        )}
        {onOpenLocation && (
          <DropdownMenuItem onClick={onOpenLocation}>
            <MapPinIcon size={16} />
            Open location
          </DropdownMenuItem>
        )}
        {onDownload && (
          <DropdownMenuItem onClick={onDownload}>
            <DownloadIcon size={16} />
            Download
          </DropdownMenuItem>
        )}
        {isShortcut && onRemoveShortcut && (
          <DropdownMenuItem onClick={onRemoveShortcut}>
            <LinkBreakIcon size={16} />
            Remove shortcut
          </DropdownMenuItem>
        )}
        {!isShortcut && onRename && (
          <DropdownMenuItem onClick={onRename}>
            <PencilSimpleIcon size={16} />
            Rename
          </DropdownMenuItem>
        )}
        {onMove && (
          <DropdownMenuItem onClick={onMove}>
            <ArrowsOutCardinalIcon size={16} />
            Move to…
          </DropdownMenuItem>
        )}
        {!isShortcut && (
          <>
            {onAddToSpace && (
              <DropdownMenuItem onClick={onAddToSpace}>
                <UsersThreeIcon size={16} />
                Add to space…
              </DropdownMenuItem>
            )}
            {onShare && (
              <DropdownMenuItem onClick={onShare}>
                <ShareNetworkIcon size={16} />
                Share…
              </DropdownMenuItem>
            )}
            {onToggleStar && (
              <DropdownMenuItem onClick={onToggleStar}>
                <StarIcon size={16} weight={menu.isStarred ? "fill" : "regular"} />
                {menu.isStarred === undefined
                  ? "Toggle star"
                  : menu.isStarred
                    ? "Remove star"
                    : "Add star"}
              </DropdownMenuItem>
            )}
            {onToggleHidden && (
              <DropdownMenuItem onClick={onToggleHidden}>
                <EyeSlashIcon size={16} />
                Toggle hidden
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive hover:text-destructive data-highlighted:text-destructive"
              >
                <TrashIcon size={16} weight="fill" />
                {menu.type === "folder" ? "Delete folder" : "Delete file"}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
