import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  UploadIcon,
  FolderPlusIcon,
  FolderOpenIcon,
  SquaresFourIcon,
  ListBulletsIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowsDownUpIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  MagnifyingGlassIcon,
  LinkSimpleIcon,
  LinkIcon,
  TelegramLogoIcon,
  GearSixIcon,
  ArrowCounterClockwiseIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { useDrive, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, type SortKey, type SortState } from "@/store/drive"
import { NewFolderDialog } from "./NewFolderDialog"
import { ImportUrlDialog } from "./ImportUrlDialog"
import { LinkFilesDialog } from "./LinkFilesDialog"
import { TelegramDialog } from "./TelegramDialog"

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  size: "Size",
  modified: "Modified",
  type: "Type",
}

export function Toolbar() {
  const nav = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [importUrlOpen, setImportUrlOpen] = useState(false)
  const [telegramOpen, setTelegramOpen] = useState(false)
  const [linkFilesOpen, setLinkFilesOpen] = useState(false)
  const {
    showHidden,
    toggleHidden,
    createFolder,
    upload,
    importUrl,
    sort,
    setSort,
    currentFolderId,
    folder,
    refresh,
  } = useDrive()

  // Labels follow the toolbar's own width (a container query), not the
  // window's: with the sidebar open the two differ by a few hundred pixels.
  // They show once every button fits on one row with its label (measured:
  // ~970px, or ~1200px with the two extra buttons a space folder gets).
  const label = folder?.spaceId ? "hidden @7xl:inline" : "hidden @5xl:inline"

  return (
    // If even the icons don't fit, the row wraps rather than widening the page.
    <div className="@container flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <Button size="sm" aria-label="Upload" title="Upload" onClick={() => fileInput.current?.click()}>
        <UploadIcon size={16} />
        <span className={label}>Upload</span>
      </Button>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files)
          e.target.value = ""
        }}
      />
      <Button size="sm" variant="outline" aria-label="Upload folder" title="Upload folder" onClick={() => folderInput.current?.click()}>
        <FolderOpenIcon size={16} />
        <span className={label}>Upload folder</span>
      </Button>
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        // Non-standard attributes (unsupported by React's input typings) that
        // switch the native picker to folder-selection mode in Chromium/Firefox.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files)
          e.target.value = ""
        }}
      />
      <Button size="sm" variant="outline" aria-label="New folder" title="New folder" onClick={() => setNewFolderOpen(true)}>
        <FolderPlusIcon size={16} />
        <span className={label}>New folder</span>
      </Button>
      <NewFolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onSubmit={(name, color, thumbnail) => createFolder(name, color, thumbnail)}
      />
      <Button size="sm" variant="outline" aria-label="Import from URL" title="Import from URL" onClick={() => setImportUrlOpen(true)}>
        <LinkSimpleIcon size={16} />
        <span className={label}>Import from URL</span>
      </Button>
      <ImportUrlDialog
        open={importUrlOpen}
        onClose={() => setImportUrlOpen(false)}
        onSubmit={(url, name) => importUrl(url, name)}
      />
      <Button size="sm" variant="outline" aria-label="Telegram" title="Telegram" onClick={() => setTelegramOpen(true)}>
        <TelegramLogoIcon size={16} />
        <span className={label}>Telegram</span>
      </Button>
      <TelegramDialog open={telegramOpen} onClose={() => setTelegramOpen(false)} />
      {folder?.spaceId && currentFolderId && (
        <>
          <Button size="sm" variant="outline" aria-label="Link" title="Link" onClick={() => setLinkFilesOpen(true)}>
            <LinkIcon size={16} />
            <span className={label}>Link</span>
          </Button>
          <LinkFilesDialog
            open={linkFilesOpen}
            targetFolderId={currentFolderId}
            displayName={folder.name}
            onClose={() => setLinkFilesOpen(false)}
            onLinked={() => void refresh()}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => nav(`/spaces/${folder.spaceId}`)}
            title="Manage members, name, and settings for this space"
            aria-label="Manage space"
          >
            <GearSixIcon size={16} />
            <span className={label}>Manage space</span>
          </Button>
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            nav(currentFolderId ? `/search?folderId=${currentFolderId}` : "/search")
          }
          title="Search in this folder"
          aria-label="Search in this folder"
        >
          <MagnifyingGlassIcon size={16} />
        </Button>
        <div className="bg-border mx-1 hidden h-5 w-px @2xl:block" />
        <ViewControls sort={sort} setSort={setSort} showHidden={showHidden} toggleHidden={toggleHidden} />
      </div>
    </div>
  )
}

/** Sort, show hidden, and grid or list: the right-hand end of a toolbar. Local files has one too.
 * Its labels size from the toolbar around it, which has to be an `@container`. */
export function ViewControls({
  sort,
  setSort,
  showHidden,
  toggleHidden,
}: {
  sort: SortState
  setSort: (sort: SortState) => void
  showHidden: boolean
  toggleHidden: () => void
}) {
  const view = useDrive((s) => s.view)
  const setView = useDrive((s) => s.setView)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="sm"
              variant="ghost"
              title={`Sort by ${SORT_LABELS[sort.key]} (${sort.dir})`}
            >
              <ArrowsDownUpIcon size={14} />
              <span className="hidden @2xl:inline">{SORT_LABELS[sort.key]}</span>
              {sort.dir === "asc" ? (
                <SortAscendingIcon size={12} className="hidden opacity-70 @2xl:inline" />
              ) : (
                <SortDescendingIcon size={12} className="hidden opacity-70 @2xl:inline" />
              )}
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <DropdownMenuCheckboxItem
              key={k}
              checked={sort.key === k}
              onClick={() => setSort({ key: k, dir: sort.dir })}
            >
              {SORT_LABELS[k]}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            closeOnClick={false}
            className="justify-between"
            onClick={() =>
              setSort({ key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" })
            }
          >
            <span className="flex items-center gap-1.5">
              {sort.dir === "asc" ? (
                <SortAscendingIcon size={14} />
              ) : (
                <SortDescendingIcon size={14} />
              )}
              {sort.dir === "asc" ? "Ascending" : "Descending"}
            </span>
            <span className="text-muted-foreground text-[11px]">click to flip</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        size="sm"
        variant={showHidden ? "default" : "ghost"}
        onClick={toggleHidden}
        title="Toggle hidden"
      >
        {showHidden ? <EyeIcon size={16} /> : <EyeSlashIcon size={16} />}
      </Button>
      <div className="bg-border mx-1 hidden h-5 w-px @2xl:block" />
      <Button
        size="sm"
        variant={view === "grid" ? "default" : "ghost"}
        onClick={() => setView("grid")}
        title="Grid view"
      >
        <SquaresFourIcon size={16} />
      </Button>
      <Button
        size="sm"
        variant={view === "list" ? "default" : "ghost"}
        onClick={() => setView("list")}
        title="List view"
      >
        <ListBulletsIcon size={16} />
      </Button>
    </>
  )
}

/** The grid's zoom slider, for a page header. Nothing in list view. */
export function ZoomControl() {
  const view = useDrive((s) => s.view)
  const zoom = useDrive((s) => s.zoom)
  const setZoom = useDrive((s) => s.setZoom)
  if (view !== "grid") return null
  return (
    <div className="hidden items-center gap-2 sm:flex">
      {zoom !== ZOOM_DEFAULT && (
        <button
          onClick={() => setZoom(ZOOM_DEFAULT)}
          className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
          title={`Reset zoom to ${ZOOM_DEFAULT}%`}
        >
          <ArrowCounterClockwiseIcon size={14} />
        </button>
      )}
      <button
        onClick={() => setZoom(Math.max(ZOOM_MIN, zoom - 10))}
        disabled={zoom <= ZOOM_MIN}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30 shrink-0 transition-colors"
        title="Zoom out"
      >
        <MagnifyingGlassMinusIcon size={16} />
      </button>
      <input
        type="range"
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        className="accent-primary h-1 w-32 cursor-pointer"
        title={`Zoom ${zoom}%`}
      />
      <button
        onClick={() => setZoom(Math.min(ZOOM_MAX, zoom + 10))}
        disabled={zoom >= ZOOM_MAX}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30 shrink-0 transition-colors"
        title="Zoom in"
      >
        <MagnifyingGlassPlusIcon size={16} />
      </button>
      <span className="text-muted-foreground w-[3.5ch] text-right text-xs leading-none tabular-nums">
        {zoom}%
      </span>
    </div>
  )
}
