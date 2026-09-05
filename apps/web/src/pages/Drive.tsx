import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowCounterClockwiseIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, UploadSimpleIcon } from "@phosphor-icons/react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useDrive, zoomToGrid, ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT } from "@/store/drive"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
import { Toolbar } from "@/components/Toolbar"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { FileGrid } from "@/components/FileGrid"
import { NavButtons } from "@/components/NavButtons"
import { ShortcutsDialog } from "@/components/ShortcutsDialog"
import { sortFiles, sortFolders } from "@/lib/sort"
import { gridColumns, gridNavIndex, type NavKey } from "@/lib/gridNav"
import { entriesFromDataTransfer } from "@/lib/dropEntries"
import { isInternalDrag } from "@/components/file-grid/dnd"

// Tags where keyboard shortcuts should stay silent — otherwise typing into
// a rename input would trigger Del=trash, etc.
function isTypingTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false
  const tag = t.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    t.isContentEditable
  )
}

// All modal overlays in the app share the same fixed/inset-0/z-50 styling.
// When any are mounted we suppress grid shortcuts so typing into a dialog
// input or pressing Del with a modal open doesn't hijack the focused item.
function isModalOpen() {
  return !!document.querySelector(".fixed.inset-0.z-50")
}

export function DrivePage() {
  const { folderId } = useParams<{ folderId: string }>()
  const nav = useNavigate()
  const {
    loadFolder,
    upload,
    folder,
    folders,
    files,
    sort,
    selection,
    select,
    selectAll,
    clearSelection,
    preview,
    setPreview,
    trashItems,
    view,
    zoom,
    setZoom,
  } = useDrive()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [showDropOverlay, setShowDropOverlay] = useState(false)
  // dragenter/dragleave fire on every child element crossed, so a plain
  // boolean flickers the overlay off when the pointer passes over a card.
  // A counter only zeroes out once the drag has actually left the window.
  const dragDepth = useRef(0)
  // Measures the rendered grid's width so ↑/↓ can skip by a full row instead
  // of walking the flat folders-then-files order (which only worked for the
  // single-column list view).
  const gridWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (folderId) void loadFolder(folderId)
  }, [folderId, loadFolder])

  // ?file=<id> opens that file's preview once the folder's contents land —
  // this is what the Telegram bot's "saved" message links at. The ref makes
  // it a one-shot: closing the preview must not reopen it.
  const [params, setParams] = useSearchParams()
  const deepLinked = useRef<string | null>(null)
  useEffect(() => {
    const id = params.get("file")
    if (!id || deepLinked.current === id) return
    const file = files.find((f) => f.id === id)
    if (!file) return
    deepLinked.current = id
    setPreview(file)
    const next = new URLSearchParams(params)
    next.delete("file")
    setParams(next, { replace: true })
  }, [params, setParams, files, setPreview])

  // Build the same flat ordering the user sees (folders first, then files),
  // so ↑/↓ walks the on-screen list.
  const ordered = useMemo(() => {
    const fs = sortFolders(folders, sort).map(
      (f) => ({ kind: "folder" as const, id: f.id, item: f })
    )
    const ff = sortFiles(files, sort).map(
      (f) => ({ kind: "file" as const, id: f.id, item: f })
    )
    return [...fs, ...ff]
  }, [folders, files, sort])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      // Let the preview / other modals own Esc — and skip all other
      // shortcuts so we don't hijack keys while a dialog is up.
      if (preview || shortcutsOpen || isModalOpen()) return

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }

      if (e.key === "Escape") {
        if (selection.size > 0) {
          e.preventDefault()
          clearSelection()
        }
        return
      }

      if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        selectAll(ordered.map((x) => x.id))
        return
      }

      if (ordered.length === 0) return

      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "Home" ||
        e.key === "End"
      ) {
        e.preventDefault()
        // List view is a single column; grid view's column count depends on
        // the responsive auto-fill layout, so it's measured from the
        // rendered width rather than assumed.
        const columns =
          view === "list"
            ? 1
            : gridColumns((gridWrapRef.current?.clientWidth ?? 0) - 16, zoomToGrid(zoom).minWidth)
        const curId = Array.from(selection)[0]
        const idx = ordered.findIndex((x) => x.id === curId)
        const next = gridNavIndex(e.key as NavKey, idx, ordered.length, columns)
        if (next >= 0) select(ordered[next].id)
        return
      }

      if (e.key === "Enter") {
        const curId = Array.from(selection)[0]
        if (!curId) return
        const row = ordered.find((x) => x.id === curId)
        if (!row) return
        e.preventDefault()
        if (row.kind === "folder") {
          nav(`/drive/${row.id}`)
        } else {
          setPreview(row.item)
        }
        return
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selection.size === 0) return
        e.preventDefault()
        // Snapshot so we don't iterate a Set that's mutating under us.
        const targets: { type: "folder" | "file"; id: string }[] = []
        for (const id of selection) {
          const row = ordered.find((x) => x.id === id)
          if (row)
            targets.push({
              type: row.kind === "folder" ? "folder" : "file",
              id,
            })
        }
        clearSelection()
        void trashItems(targets)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [
    ordered,
    selection,
    preview,
    shortcutsOpen,
    view,
    zoom,
    clearSelection,
    select,
    selectAll,
    setPreview,
    trashItems,
    nav,
  ])

  return (
    <div
      className="relative flex h-screen"
      onDragEnter={(e) => {
        if (isInternalDrag(e)) return
        if (!Array.from(e.dataTransfer.types).includes("Files")) return
        dragDepth.current++
        setShowDropOverlay(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
      }}
      onDragLeave={(e) => {
        if (isInternalDrag(e)) return
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setShowDropOverlay(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        dragDepth.current = 0
        setShowDropOverlay(false)
        if (isInternalDrag(e)) return
        const dataTransfer = e.dataTransfer
        if (!dataTransfer?.items?.length && !dataTransfer?.files?.length) return
        // Walk dropped entries so folders (and their subfolders) keep their
        // structure instead of collapsing into a flat file list.
        void entriesFromDataTransfer(dataTransfer).then((entries) => {
          if (entries.length) void upload(entries)
        })
      }}
    >
      {showDropOverlay && (
        // z-40, not z-50 — isModalOpen() keys off ".fixed.inset-0.z-50" to
        // detect real dialogs, and this overlay isn't one.
        <div className="bg-primary/10 border-primary pointer-events-none fixed inset-0 z-40 flex items-center justify-center border-4 border-dashed backdrop-blur-[1px]">
          <div className="bg-background flex flex-col items-center gap-2 rounded-xl border px-8 py-6 text-center shadow-lg">
            <UploadSimpleIcon size={28} className="text-primary" />
            <div className="text-lg font-semibold">Drop to upload</div>
            <div className="text-muted-foreground text-sm">
              Files and folders will be added to this folder
            </div>
          </div>
        </div>
      )}
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <SidebarToggle />
            <Breadcrumbs />
          </div>
          <div className="flex items-center gap-3">
            {folder?.spaceId && (
              <Link
                to={`/spaces/${folder.spaceId}`}
                className="bg-accent text-accent-foreground hover:opacity-80 rounded-full px-2 py-0.5 text-xs"
                title="View space info & settings"
              >
                shared space
              </Link>
            )}
            {view === "grid" && (
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
            )}
            <div className="flex items-center gap-1">
              <HeaderActions onReload={() => folderId && loadFolder(folderId)} />
            </div>
          </div>
        </header>
        <div className="flex items-center gap-2 border-b p-2 md:gap-3 md:p-3">
          <div className="hidden md:block">
            <NavButtons />
          </div>
          <div className="bg-border hidden h-6 w-px md:block" />
          <Toolbar />
        </div>
        <div ref={gridWrapRef} className="flex-1 overflow-auto">
          <FileGrid />
        </div>
      </main>
      <ShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  )
}
