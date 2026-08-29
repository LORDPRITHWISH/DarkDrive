import { useEffect, useState } from "react"
import { ArrowUUpLeft, Minus, Plus, Stack, Star, Trash, X } from "@phosphor-icons/react"
import { thumbUrl } from "@/lib/api"
import { useGallery } from "@/store/gallery"

/**
 * The floating bar that replaces the toolbar once anything is picked. It is
 * the only place bulk actions live — a per-tile menu at contact-sheet size is
 * a target nobody can hit.
 */
export function SelectionBar({
  mode,
  albumId,
  onChanged,
}: {
  mode: "library" | "trash" | "album"
  albumId?: string
  onChanged?: () => void
}) {
  const { selected, clearSelection, setStarred, setTrashed, removeFromAlbum } = useGallery()
  const [picking, setPicking] = useState(false)
  const ids = Array.from(selected)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [clearSelection])

  if (!ids.length) return null

  const after = async (run: Promise<unknown>) => {
    await run
    onChanged?.()
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
        <div className="bg-card/95 flex items-center gap-1 rounded-full border p-1.5 pl-4 shadow-2xl backdrop-blur">
          <span className="pr-2 text-sm tabular-nums">
            {ids.length} selected
          </span>

          {mode !== "trash" && (
            <>
              <Action
                icon={Star}
                label="Favorite"
                onClick={() => void after(setStarred(ids, true))}
              />
              <Action icon={Stack} label="Add to album" onClick={() => setPicking(true)} />
            </>
          )}
          {mode === "album" && albumId && (
            <Action
              icon={Minus}
              label="Remove from album"
              onClick={() => void after(removeFromAlbum(albumId, ids))}
            />
          )}
          {mode === "trash" ? (
            <Action
              icon={ArrowUUpLeft}
              label="Restore"
              onClick={() => void after(setTrashed(ids, false))}
            />
          ) : (
            <Action
              icon={Trash}
              label="Move to bin"
              onClick={() => void after(setTrashed(ids, true))}
            />
          )}
          <Action icon={X} label="Clear selection" onClick={clearSelection} />
        </div>
      </div>

      {picking && (
        <AlbumPicker
          fileIds={ids}
          onClose={() => setPicking(false)}
          onDone={() => {
            setPicking(false)
            onChanged?.()
          }}
        />
      )}
    </>
  )
}

function Action({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; weight?: "fill" | "bold" }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="hover:bg-background grid size-9 place-items-center rounded-full transition-colors"
    >
      <Icon size={18} />
    </button>
  )
}

function AlbumPicker({
  fileIds,
  onClose,
  onDone,
}: {
  fileIds: string[]
  onClose: () => void
  onDone: () => void
}) {
  const { albums, loadAlbums, addToAlbum, createAlbum } = useGallery()
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void loadAlbums()
  }, [loadAlbums])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-sm rounded-2xl border p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif text-lg">
          Add {fileIds.length} {fileIds.length === 1 ? "photo" : "photos"} to…
        </h2>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) void run(() => createAlbum(name.trim(), fileIds))
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New album name"
            className="bg-background focus:ring-primary min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
          />
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-lg disabled:opacity-40"
            aria-label="Create album"
          >
            <Plus size={18} weight="bold" />
          </button>
        </form>

        <div className="mt-4 max-h-64 space-y-1 overflow-auto">
          {albums.map((a) => (
            <button
              key={a.id}
              disabled={busy}
              onClick={() => void run(() => addToAlbum(a.id, fileIds))}
              className="hover:bg-background flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors disabled:opacity-50"
            >
              <span className="bg-background size-10 shrink-0 overflow-hidden rounded-md">
                {a.cover && (
                  <img
                    src={thumbUrl(a.cover.id)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{a.name}</span>
                <span className="text-muted-foreground text-xs">{a.count} items</span>
              </span>
            </button>
          ))}
          {!albums.length && (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No albums yet — name one above.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
