import {
  ArrowsOutCardinalIcon,
  DownloadIcon,
  EyeIcon as OpenEyeIcon,
  EyeSlashIcon,
  FileZipIcon,
  InfoIcon,
  LinkBreakIcon,
  PencilSimpleIcon,
  ShareNetworkIcon,
  StarIcon,
  TrashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react"

export type MenuPos = {
  x: number
  y: number
  type: "folder" | "file"
  id: string
  name: string
  shortcutId?: string
  hasThumbnail?: boolean
}

type Props = {
  menu: MenuPos
  onOpen: () => void
  onProperties: () => void
  onExtract: () => void
  onDownload: () => void
  onRename: () => void
  onMove: () => void
  onFolderProperties: () => void
  onShare: () => void
  onToggleStar: () => void
  onToggleHidden: () => void
  onDelete: () => void
  onRemoveShortcut: () => void
  onAddToSpace: () => void
}

export function FileContextMenu({
  menu,
  onOpen,
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
    <ul
      className="bg-popover text-popover-foreground fixed z-50 w-56 rounded-md border p-1 text-sm shadow-lg"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {menu.type === "file" && (
        <>
          <MenuItem icon={<OpenEyeIcon size={16} />} onClick={onOpen}>
            Open
          </MenuItem>
          <MenuItem icon={<InfoIcon size={16} />} onClick={onProperties}>
            Properties
          </MenuItem>
          {isZip && (
            <MenuItem icon={<FileZipIcon size={16} />} onClick={onExtract}>
              Extract here
            </MenuItem>
          )}
        </>
      )}
      {menu.type === "folder" && !isShortcut && (
        <MenuItem icon={<InfoIcon size={16} />} onClick={onFolderProperties}>
          Properties…
        </MenuItem>
      )}
      <MenuItem icon={<DownloadIcon size={16} />} onClick={onDownload}>
        Download
      </MenuItem>
      {isShortcut && (
        <MenuItem icon={<LinkBreakIcon size={16} />} onClick={onRemoveShortcut}>
          Remove shortcut
        </MenuItem>
      )}
      {!isShortcut && (
        <MenuItem icon={<PencilSimpleIcon size={16} />} onClick={onRename}>
          Rename
        </MenuItem>
      )}
      <MenuItem icon={<ArrowsOutCardinalIcon size={16} />} onClick={onMove}>
        Move to…
      </MenuItem>
      {!isShortcut && (
        <>
          <MenuItem icon={<UsersThreeIcon size={16} />} onClick={onAddToSpace}>
            Add to space…
          </MenuItem>
          <MenuItem icon={<ShareNetworkIcon size={16} />} onClick={onShare}>
            Share…
          </MenuItem>
          <MenuItem icon={<StarIcon size={16} />} onClick={onToggleStar}>
            Toggle star
          </MenuItem>
          <MenuItem icon={<EyeSlashIcon size={16} />} onClick={onToggleHidden}>
            Toggle hidden
          </MenuItem>
          <MenuItem
            icon={<TrashIcon size={16} weight="fill" />}
            danger
            onClick={onDelete}
          >
            {menu.type === "folder" ? "Delete folder" : "Delete file"}
          </MenuItem>
        </>
      )}
    </ul>
  )
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon?: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left ${
          danger ? "text-destructive hover:text-destructive" : ""
        }`}
      >
        {icon}
        <span>{children}</span>
      </button>
    </li>
  )
}
