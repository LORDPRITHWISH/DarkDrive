import { Fragment, useEffect, useState } from "react"
import {
  ArrowsOutCardinalIcon,
  DesktopIcon,
  DownloadIcon,
  EyeIcon as OpenEyeIcon,
  EyeSlashIcon,
  FileZipIcon,
  InfoIcon,
  LinkBreakIcon,
  LinkSimpleIcon,
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu"
import { desktop } from "@/lib/desktop"
import { toast } from "@/store/toast"

// In a browser on a computer, where the desktop app might be installed: it
// answers darkdrive:// links (apps/desktop main.ts). If it isn't, the link
// goes nowhere.
const canHandOff = !desktop && window.matchMedia("(pointer: fine)").matches

export type MenuPos = {
  x: number
  y: number
  type: "folder" | "file"
  id: string
  name: string
  shortcutId?: string
  hasThumbnail?: boolean
  isStarred?: boolean
  isHidden?: boolean
  /** How many items the menu acts on, where its host has a selection. Over one, only what applies to all of them is offered. */
  count?: number
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
  onLinkToSynced?: () => void
  /** The host's own entries, after the ones that open things. */
  children?: React.ReactNode
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
  onLinkToSynced,
  children,
}: Props) {
  const isShortcut = !!menu.shortcutId
  // In the desktop app, whether this item is in a folder synced here. Asked
  // per menu (it's a local lookup), and tagged with the id it's for, since
  // the menu can move to another item before the answer comes back.
  const [local, setLocal] = useState<{ id: string; path: string | null }>()
  useEffect(() => {
    void desktop?.localPath(menu.type, menu.id).then((path) => setLocal({ id: menu.id, path }))
  }, [menu.type, menu.id])
  const localPath = local?.id === menu.id ? local.path : null
  const isZip = menu.type === "file" && /\.zip$/i.test(menu.name)
  const file = menu.type === "file"
  const one = (menu.count ?? 1) < 2
  const item = (icon: React.ReactNode, label: string, onClick: (() => void) | undefined, className?: string) =>
    onClick && (
      <DropdownMenuItem key={label} onClick={onClick} className={className}>
        {icon}
        {label}
      </DropdownMenuItem>
    )
  // One group per thing the user came to do: open it, handle it, put it
  // somewhere else too, mark it, be rid of it. A line between each.
  const groups = [
    [
      // What a double-click does, so it stands out as the default.
      one && file && item(<OpenEyeIcon size={16} />, "Open", onOpen, "font-medium"),
      one && isZip && item(<FileZipIcon size={16} />, "Extract here", onExtract),
      one && item(<MapPinIcon size={16} />, "Open location", onOpenLocation),
      one && localPath && (
        <DropdownMenuItem
          key="local"
          title={localPath}
          onClick={() => {
            desktop!.show(menu.type, menu.id).catch((e: Error) => toast.error(e.message))
            onClose()
          }}
        >
          <DesktopIcon size={16} />
          Show on this computer
        </DropdownMenuItem>
      ),
      one &&
        canHandOff &&
        !isShortcut &&
        item(<DesktopIcon size={16} />, "Open in desktop app", () => {
          window.location.assign(`darkdrive://${menu.type}/${menu.id}`)
          onClose()
        }),
      one && children ? <Fragment key="host">{children}</Fragment> : null,
    ],
    [
      item(<DownloadIcon size={16} />, "Download", onDownload),
      one && !isShortcut && item(<PencilSimpleIcon size={16} />, "Rename", onRename),
      item(<ArrowsOutCardinalIcon size={16} />, "Move to…", onMove),
    ],
    [
      !isShortcut && item(<UsersThreeIcon size={16} />, "Add to space…", onAddToSpace),
      !isShortcut && item(<LinkSimpleIcon size={16} />, "Link to synced folder…", onLinkToSynced),
      one && !isShortcut && item(<ShareNetworkIcon size={16} />, "Share…", onShare),
    ],
    [
      one &&
        !isShortcut &&
        item(
          <StarIcon size={16} weight={menu.isStarred ? "fill" : "regular"} />,
          menu.isStarred ? "Remove star" : "Add star",
          onToggleStar
        ),
      one && !isShortcut && item(<EyeSlashIcon size={16} />, menu.isHidden ? "Unhide" : "Hide", onToggleHidden),
      one && (file || !isShortcut) && item(<InfoIcon size={16} />, "Properties", file ? onProperties : onFolderProperties),
    ],
    [
      // The link goes, the file it points at stays: not a deletion.
      one && isShortcut && item(<LinkBreakIcon size={16} />, "Remove shortcut", onRemoveShortcut),
      !isShortcut &&
        item(
          <TrashIcon size={16} />,
          "Move to bin",
          onDelete,
          "text-destructive hover:text-destructive data-highlighted:text-destructive"
        ),
    ],
  ]
    .map((group) => group.filter(Boolean))
    .filter((group) => group.length)

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
        // Icons sit back so the labels lead, and come forward with the row
        // that is pointed at. The host's own entries get the same.
        className="w-56 [&_[data-slot=dropdown-menu-item]>svg]:text-muted-foreground [&_[data-slot=dropdown-menu-item][data-highlighted]>svg]:text-current [&_[data-slot=dropdown-menu-item].text-destructive>svg]:text-current"
      >
        {!one && <DropdownMenuLabel className="normal-case tracking-normal">{menu.count} items selected</DropdownMenuLabel>}
        {groups.map((group, i) => (
          <Fragment key={i}>
            {(i > 0 || !one) && <DropdownMenuSeparator />}
            {group}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
