import { useEffect, useMemo, useState } from "react"
import { ArrowCounterClockwiseIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from "@phosphor-icons/react"
import { useNavigate, useParams } from "react-router-dom"
import { useDrive, ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT } from "@/store/drive"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { Toolbar } from "@/components/Toolbar"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { FileGrid } from "@/components/FileGrid"
import { NavButtons } from "@/components/NavButtons"
import { ShortcutsDialog } from "@/components/ShortcutsDialog"
import { sortFiles, sortFolders } from "@/lib/sort"

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
    clearSelection,
    preview,
    setPreview,
    trashItem,
    view,
    zoom,
    setZoom,
  } = useDrive()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useEffect(() => {
    if (folderId) void loadFolder(folderId)
  }, [folderId, loadFolder])

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

      if (ordered.length === 0) return

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        const curId = Array.from(selection)[0]
        const idx = ordered.findIndex((x) => x.id === curId)
        const next =
          e.key === "ArrowDown"
            ? idx < 0
              ? 0
              : Math.min(ordered.length - 1, idx + 1)
            : idx < 0
              ? ordered.length - 1
              : Math.max(0, idx - 1)
        select(ordered[next].id)
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
        for (const t of targets) void trashItem(t.type, t.id)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [
    ordered,
    selection,
    preview,
    shortcutsOpen,
    clearSelection,
    select,
    setPreview,
    trashItem,
    nav,
  ])

  return (
    <div
      className="flex h-screen"
      onDragOver={(e) => {
        e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        if (e.dataTransfer?.files?.length) void upload(e.dataTransfer.files)
      }}
    >
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <SidebarToggle />
            <Breadcrumbs />
          </div>
          <div className="flex items-center gap-3">
            {folder?.spaceId && (
              <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs">
                shared space
              </span>
            )}
            {view === "grid" && (
              <div className="flex items-center gap-2">
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
          </div>
        </header>
        <div className="flex items-center gap-3 border-b p-3">
          <NavButtons />
          <div className="bg-border h-6 w-px" />
          <Toolbar />
        </div>
        <div className="flex-1 overflow-auto">
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
