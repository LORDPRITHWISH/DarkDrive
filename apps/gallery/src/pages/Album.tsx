import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { CaretLeft, PencilSimple, Trash } from "@phosphor-icons/react"
import { apiGet } from "@/lib/api"
import { PhotoGrid, useDensity } from "@/components/PhotoGrid"
import { Lightbox } from "@/components/Lightbox"
import { SelectionBar } from "@/components/SelectionBar"
import { useGallery } from "@/store/gallery"
import type { Item } from "@/lib/types"

type AlbumResponse = { album: { id: string; name: string }; items: Item[] }

// An album owns its own list rather than sharing the timeline's — the two
// scroll independently and a photo can be in both at once.
export function AlbumPage() {
  const { id = "" } = useParams()
  const nav = useNavigate()
  const { renameAlbum, deleteAlbum, clearSelection } = useGallery()
  const [data, setData] = useState<AlbumResponse | null>(null)
  const [density] = useDensity()
  const [open, setOpen] = useState<number | null>(null)
  const [renaming, setRenaming] = useState("")

  const load = useCallback(async () => {
    setData(await apiGet<AlbumResponse>(`/api/gallery/albums/${id}`))
  }, [id])

  useEffect(() => {
    clearSelection()
    void load()
  }, [load, clearSelection])

  if (!data) return <p className="text-muted-foreground p-8 text-sm">Loading…</p>

  return (
    <>
      <div className="flex items-center gap-3 px-3 pt-2 sm:px-5">
        <button
          onClick={() => nav("/albums")}
          aria-label="Back to albums"
          className="hover:bg-card grid size-9 place-items-center rounded-full transition-colors"
        >
          <CaretLeft size={18} />
        </button>

        {renaming ? (
          <form
            className="flex flex-1 gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              await renameAlbum(id, renaming.trim())
              setData({ ...data, album: { ...data.album, name: renaming.trim() } })
              setRenaming("")
            }}
          >
            <input
              autoFocus
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
              onBlur={() => setRenaming("")}
              className="bg-card focus:ring-primary max-w-sm flex-1 rounded-lg border px-3 py-1.5 font-serif text-xl outline-none focus:ring-2"
            />
          </form>
        ) : (
          <h1 className="flex-1 truncate font-serif text-2xl tracking-tight">
            {data.album.name}
            <span className="text-muted-foreground ml-3 text-sm tabular-nums">
              {data.items.length}
            </span>
          </h1>
        )}

        <button
          onClick={() => setRenaming(data.album.name)}
          aria-label="Rename album"
          className="hover:bg-card text-muted-foreground grid size-9 place-items-center rounded-full transition-colors"
        >
          <PencilSimple size={17} />
        </button>
        <button
          onClick={async () => {
            // The photos are untouched — only the grouping goes away, which is
            // why this needs no scarier confirmation than the wording.
            if (!confirm(`Delete the album "${data.album.name}"? The photos stay in your library.`))
              return
            await deleteAlbum(id)
            nav("/albums")
          }}
          aria-label="Delete album"
          className="hover:bg-card text-muted-foreground grid size-9 place-items-center rounded-full transition-colors"
        >
          <Trash size={17} />
        </button>
      </div>

      {data.items.length === 0 ? (
        <p className="text-muted-foreground px-6 py-24 text-center text-sm">
          Empty album. Pick photos in your library and use “Add to album”.
        </p>
      ) : (
        <PhotoGrid items={data.items} density={density} onOpen={setOpen} />
      )}

      <SelectionBar mode="album" albumId={id} onChanged={load} />

      {open !== null && data.items.length > 0 && (
        <Lightbox
          items={data.items}
          index={Math.min(open, data.items.length - 1)}
          onIndex={setOpen}
          onClose={() => {
            setOpen(null)
            void load()
          }}
        />
      )}
    </>
  )
}
