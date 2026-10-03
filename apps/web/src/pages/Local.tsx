import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import { Navigate, useNavigate, useSearchParams } from "react-router-dom"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  ChartBarHorizontalIcon,
  CloudCheckIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Button } from "@workspace/ui/components/button"
import { DropdownMenuItem } from "@workspace/ui/components/dropdown-menu"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { ComputerTabs } from "@/components/ComputerTabs"
import { ViewControls, ZoomControl } from "@/components/Toolbar"
import { FolderCard } from "@/components/file-grid/FolderCard"
import { FileCard } from "@/components/file-grid/FileCard"
import { FileListView } from "@/components/file-grid/FileListView"
import { FileContextMenu, type MenuPos } from "@/components/file-grid/FileContextMenu"
import { desktop, type LocalEntry, type LocalListing } from "@/lib/desktop"
import { formatBytes } from "@/lib/format"
import { usePaged } from "@/lib/paged"
import { sortFiles, sortFolders } from "@/lib/sort"
import type { FileItem, Folder } from "@/lib/types"
import { useAuth } from "@/store/auth"
import { useDrive, zoomToGrid, type SortState } from "@/store/drive"
import { toast } from "@/store/toast"

const run = (fn: () => Promise<unknown>) =>
  void fn().catch((e: Error) => toast.error(e.message))

// Something on this computer, in the shape the drive's cards and rows take, so
// this page is made of the same ones. Its path is its id. None of it is the
// API's: no star, and no thumbnail to ask for.
const shared = (e: LocalEntry) => {
  const at = new Date(e.modified).toISOString()
  return {
    id: e.path,
    name: e.name,
    ownerId: "",
    spaceId: null,
    isHidden: e.name.startsWith("."),
    isTrashed: false,
    isStarred: false,
    createdAt: at,
    updatedAt: at,
  }
}
const asFolder = (e: LocalEntry): Folder => ({ ...shared(e), color: null, parentId: null, size: e.size })

// Not a real MIME type, but enough of one for what the drive does with it:
// pick the icon, and group by kind and then extension when sorting by type.
const KINDS: [string, RegExp][] = [
  ["image", /^(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|avif|ico|svg)$/],
  ["video", /^(mp4|mkv|webm|mov|avi|m4v|wmv|flv|mpe?g|3gp)$/],
  ["audio", /^(mp3|wav|flac|ogg|oga|m4a|aac|opus|wma)$/],
]
const typeOf = (name: string) => {
  const ext = /\.([^.]+)$/.exec(name)?.[1].toLowerCase()
  return ext ? `${KINDS.find(([, re]) => re.test(ext))?.[0] ?? "application"}/${ext}` : ""
}

const asFile = (e: LocalEntry): FileItem => ({
  ...shared(e),
  folderId: "",
  size: e.size ?? 0,
  storageKey: "",
  tags: [],
  thumbnailState: "unsupported",
  mimeType: typeOf(e.name),
})

// This computer's own files, in the desktop app: the Files half of "This
// computer" (pages/Sync is the other), looking and working like the drive
// (pages/Drive): open, rename and bin things, see what's taking the
// room, see what's already in DarkDrive and start syncing what isn't. The
// folder being shown is ?dir=, so back and forward walk the folders visited.
// The desktop app does the looking and the changing (apps/desktop local.ts).
export function LocalPage() {
  const [params, setParams] = useSearchParams()
  const dir = params.get("dir") ?? undefined
  const [listing, setListing] = useState<LocalListing | null>(null)
  const [hidden, setHidden] = useState(false)
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" })
  const [measuring, setMeasuring] = useState(false)
  const [menu, setMenu] = useState<MenuPos | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  // A card commits its new name on Enter and again as its box goes away. This
  // is the one still waiting to be committed, so only the first counts.
  const naming = useRef<string | null>(null)
  const [tick, reload] = useReducer((n: number) => n + 1, 0)
  const { view, setView, zoom, selection, select, selectRange, clearSelection } = useDrive()
  const temp = useAuth((s) => !!s.user?.tempSessionExpiresAt)
  const nav = useNavigate()

  useEffect(() => {
    // An answer about a folder since left mustn't replace the one being shown.
    let live = true
    desktop
      ?.listLocal(dir, hidden)
      .then((l) => live && setListing(l))
      .catch((e: Error) => toast.error(e.message))
    return () => {
      live = false
    }
  }, [dir, hidden, tick])

  // The selection is the drive's own, so what was picked there, or in the
  // folder before this one, isn't picked here, nor this in the drive after.
  useEffect(() => {
    clearSelection()
    return clearSelection
  }, [dir, clearSelection])

  const { folders, files, routes } = useMemo(() => {
    const all = listing?.entries ?? []
    return {
      folders: sortFolders(all.filter((e) => e.dir).map(asFolder), sort),
      files: sortFiles(all.filter((e) => !e.dir).map(asFile), sort),
      routes: new Map(all.map((e) => [e.path, e.route])),
    }
  }, [listing, sort])
  const total = folders.length + files.length
  const { visibleCount, sentinelRef } = usePaged(total, listing?.dir)

  // Someone else's temporary login has no business in this computer's files.
  if (!desktop || temp) return <Navigate to="/home" replace />
  const d = desktop
  const go = (to: string) => setParams({ dir: to })
  const { minWidth, iconSize } = zoomToGrid(zoom)
  const visibleFolders = folders.slice(0, visibleCount)
  const visibleFiles = files.slice(0, Math.max(0, visibleCount - folders.length))
  const orderedIds = [...folders, ...files].map((f) => f.id)

  // Biggest first, as a list, with what's hidden too: that's where the room usually went.
  const measure = () => {
    if (!listing) return
    setMeasuring(true)
    setHidden(true)
    setSort({ key: "size", dir: "desc" })
    setView("list")
    d.measureLocal(listing.dir)
      .then(reload)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setMeasuring(false))
  }

  const rename = (id: string, name: string) => {
    naming.current = id
    setRenaming(id)
    setRenameValue(name)
  }
  const stopRenaming = () => {
    naming.current = null
    setRenaming(null)
  }
  const commitRename = (id: string) => {
    if (naming.current !== id) return
    stopRenaming()
    const name = renameValue.trim()
    if (name && name !== listing?.entries.find((e) => e.path === id)?.name)
      run(() => d.renameLocal(id, name).then(reload))
  }

  // Made under a name nothing here has, then renamed in place, like any file manager.
  const newFolder = () =>
    run(async () => {
      if (!listing) return
      const taken = new Set(listing.entries.map((e) => e.name))
      let name = "New folder"
      for (let n = 2; taken.has(name); n++) name = `New folder ${n}`
      const made = await d.newLocalFolder(listing.dir, name)
      reload()
      rename(made, name)
    })

  // The desktop app asks before it bins anything; false is "no". Listed again
  // even if it fails, since some may have gone before the one that didn't.
  const bin = (paths: string[]) =>
    run(() =>
      d
        .trashLocal(paths)
        .then((went) => went && clearSelection())
        .finally(reload)
    )
  // Right-clicking one of several picked is about all of them.
  const picked = (id: string) => (selection.has(id) && selection.size > 1 ? [...selection] : [id])

  const clickSelect = (e: React.MouseEvent, id: string) =>
    e.shiftKey ? selectRange(id, orderedIds) : select(id, e.metaKey || e.ctrlKey)
  const openMenu = (e: React.MouseEvent, type: "folder" | "file", id: string, name: string) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, type, id, name })
  }
  const closeMenu = () => setMenu(null)
  const menuRoute = menu && routes.get(menu.id)

  // Where the drive's cards have their star: whether DarkDrive has this too.
  const inDrive = (id: string, className: string) =>
    routes.get(id) ? (
      <span title="In DarkDrive" className={`text-primary ${className}`}>
        <CloudCheckIcon size={16} weight="fill" />
      </span>
    ) : null
  const renameProps = (id: string) => ({
    renaming: renaming === id,
    renameValue,
    onRenameChange: setRenameValue,
    onRenameCommit: () => commitRename(id),
    onRenameCancel: stopRenaming,
  })
  // Nothing here can be dragged into anything: moving a file into a synced
  // folder would upload it.
  const noDrag = () => {}

  return (
    <div className="relative flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarToggle />
            <ComputerTabs />
            <Breadcrumbs
              trail={(listing?.parents ?? []).map((p) => ({
                name: p.name,
                to: `/local?dir=${encodeURIComponent(p.dir)}`,
              }))}
            />
          </div>
          <div className="flex items-center gap-3">
            <ZoomControl />
            <div className="flex items-center gap-1">
              <HeaderActions onReload={reload} />
            </div>
          </div>
        </header>
        <div className="flex items-center gap-2 border-b p-2 md:gap-3 md:p-3">
          <div className="hidden items-center gap-1 md:flex">
            <Button size="sm" variant="ghost" onClick={() => nav(-1)} title="Back" aria-label="Back">
              <ArrowLeftIcon size={16} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => nav(1)} title="Forward" aria-label="Forward">
              <ArrowRightIcon size={16} />
            </Button>
          </div>
          <div className="bg-border hidden h-6 w-px md:block" />
          <div className="@container flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <Button size="sm" onClick={newFolder}>
              <FolderPlusIcon size={16} />
              <span className="hidden md:inline">New folder</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={measuring}
              title="Work out how big each folder is, and list the biggest first"
              onClick={measure}
            >
              <ChartBarHorizontalIcon size={16} />
              <span className="hidden md:inline">{measuring ? "Measuring…" : "Measure"}</span>
            </Button>
            <div className="ml-auto flex items-center gap-1">
              <ViewControls sort={sort} setSort={setSort} showHidden={hidden} toggleHidden={() => setHidden(!hidden)} />
            </div>
          </div>
        </div>

        {/* The one row the drive hasn't got: a disk has places to jump to, and only so much room. */}
        {listing && (
          <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5 md:px-3">
            {listing.places.map((p) => (
              <Button
                key={p.dir}
                size="sm"
                variant={p.dir === listing.dir ? "secondary" : "ghost"}
                title={p.dir}
                onClick={() => go(p.dir)}
              >
                {p.name}
              </Button>
            ))}
            <span className="text-muted-foreground ml-auto px-1 text-xs">
              {listing.size !== null && `${formatBytes(listing.size)} here`}
              {listing.size !== null && listing.disk && " · "}
              {listing.disk && `${formatBytes(listing.disk.free)} free of ${formatBytes(listing.disk.total)}`}
            </span>
          </div>
        )}

        <ScrollArea className="min-h-0 flex-1">
          {selection.size > 0 && (
            <div className="bg-card sticky top-0 z-20 mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm">
              <span className="font-medium">{selection.size} selected</span>
              <Button size="sm" variant="outline" onClick={() => bin([...selection])}>
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
          {listing && total === 0 ? (
            <div className="text-muted-foreground grid min-h-[50vh] place-items-center text-sm">
              This folder is empty.
            </div>
          ) : view === "grid" ? (
            <div
              className="grid gap-3 p-2"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` }}
            >
              {visibleFolders.map((f) => (
                <FolderCard
                  key={f.id}
                  folder={f}
                  selected={selection.has(f.id)}
                  iconSize={iconSize}
                  onClick={(e) => clickSelect(e, f.id)}
                  onDoubleClick={() => go(f.id)}
                  onContextMenu={(e) => openMenu(e, "folder", f.id, f.name)}
                  onDragStart={noDrag}
                  onMoveDrop={noDrag}
                  corner={inDrive(f.id, "absolute top-2 right-2 z-10")}
                  {...renameProps(f.id)}
                />
              ))}
              {visibleFiles.map((f) => (
                <FileCard
                  key={f.id}
                  file={f}
                  selected={selection.has(f.id)}
                  iconSize={iconSize}
                  onClick={(e) => clickSelect(e, f.id)}
                  onDoubleClick={() => run(() => d.openLocal(f.id))}
                  onContextMenu={(e) => openMenu(e, "file", f.id, f.name)}
                  onDragStart={noDrag}
                  corner={inDrive(f.id, "absolute top-2 right-2 z-10")}
                  {...renameProps(f.id)}
                />
              ))}
            </div>
          ) : (
            <FileListView
              folders={visibleFolders}
              files={visibleFiles}
              selection={selection}
              onSelect={(id, e) => clickSelect(e, id)}
              onOpenFolder={go}
              onOpenFile={(f) => run(() => d.openLocal(f.id))}
              onMenu={openMenu}
              onDragStart={noDrag}
              onMoveDrop={noDrag}
              rename={{
                id: renaming,
                value: renameValue,
                onChange: setRenameValue,
                onCommit: (_type, id) => commitRename(id),
                onCancel: stopRenaming,
              }}
              mark={(id) => inDrive(id, "shrink-0")}
              total={listing?.size ?? undefined}
            />
          )}
          {visibleCount < total && (
            <div ref={sentinelRef} className="text-muted-foreground grid h-16 place-items-center text-xs">
              Loading more…
            </div>
          )}
        </ScrollArea>
      </main>

      {menu && (
        <FileContextMenu
          menu={menu}
          onClose={closeMenu}
          onOpen={() => {
            run(() => d.openLocal(menu.id))
            closeMenu()
          }}
          onRename={() => {
            rename(menu.id, menu.name)
            closeMenu()
          }}
          onDelete={() => {
            closeMenu()
            bin(picked(menu.id))
          }}
        >
          {menuRoute ? (
            <DropdownMenuItem onClick={() => nav(menuRoute)}>
              <CloudCheckIcon size={16} />
              Open in DarkDrive
            </DropdownMenuItem>
          ) : (
            menu.type === "folder" && (
              <DropdownMenuItem
                onClick={() => {
                  closeMenu()
                  run(async () => {
                    // The desktop app asks before it starts; false is "no".
                    if (!(await d.syncLocal(menu.id))) return
                    toast.success(`Syncing "${menu.name}" with DarkDrive`)
                    reload()
                  })
                }}
              >
                <ArrowsClockwiseIcon size={16} />
                Sync with DarkDrive
              </DropdownMenuItem>
            )
          )}
          <DropdownMenuItem
            onClick={() => {
              run(() => d.showLocal(menu.id))
              closeMenu()
            }}
          >
            <FolderOpenIcon size={16} />
            Show in file manager
          </DropdownMenuItem>
        </FileContextMenu>
      )}
    </div>
  )
}
