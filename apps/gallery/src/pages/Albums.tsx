import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Plus, Stack } from "@phosphor-icons/react"
import { thumbUrl } from "@/lib/api"
import { useGallery } from "@/store/gallery"

export function AlbumsPage() {
  const { albums, loadAlbums, createAlbum } = useGallery()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")

  useEffect(() => {
    void loadAlbums()
  }, [loadAlbums])

  return (
    <div className="px-3 pt-2 pb-24 sm:px-5">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl tracking-tight">Albums</h1>
        <button
          onClick={() => setCreating((v) => !v)}
          className="bg-card hover:bg-card/70 flex items-center gap-2 rounded-full px-3.5 py-2 text-sm transition-colors"
        >
          <Plus size={16} weight="bold" /> New album
        </button>
      </div>

      {creating && (
        <form
          className="mt-4 flex max-w-sm gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!name.trim()) return
            await createAlbum(name.trim())
            setName("")
            setCreating(false)
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Album name"
            className="bg-card focus:ring-primary flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
          />
          <button
            type="submit"
            className="bg-primary text-primary-foreground rounded-lg px-4 text-sm font-medium"
          >
            Create
          </button>
        </form>
      )}

      {albums.length === 0 ? (
        <div className="grid place-items-center px-6 py-32 text-center">
          <Stack size={44} weight="light" className="text-muted-foreground/60 mb-4" />
          <h2 className="font-serif text-xl">No albums yet</h2>
          <p className="text-muted-foreground mt-2 max-w-sm text-sm">
            Albums are just groupings — a photo can sit in as many as you like, and stays in
            your library either way.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {albums.map((a) => (
            <Link key={a.id} to={`/albums/${a.id}`} className="group block">
              <div className="bg-card relative aspect-square overflow-hidden rounded-xl">
                {a.cover ? (
                  <img
                    src={thumbUrl(a.cover.id)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="text-muted-foreground/50 grid h-full place-items-center">
                    <Stack size={28} weight="light" />
                  </div>
                )}
                {/* A stacked-paper edge on hover — the one bit of skeuomorphism
                    that makes an album read as a container, not a photo. */}
                <div className="ring-primary/0 group-hover:ring-primary/60 absolute inset-0 rounded-xl ring-2 transition-all" />
              </div>
              <p className="mt-2 truncate text-sm">{a.name}</p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {a.count} {a.count === 1 ? "item" : "items"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
