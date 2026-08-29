import { useEffect, useRef, useState } from "react"
import { ImagesSquare, SquaresFour, Star, Trash } from "@phosphor-icons/react"
import { PhotoGrid, useDensity } from "@/components/PhotoGrid"
import { Lightbox } from "@/components/Lightbox"
import { SelectionBar } from "@/components/SelectionBar"
import { useGallery, type Filter } from "@/store/gallery"

const EMPTY: Record<Filter, { icon: typeof ImagesSquare; title: string; body: string }> = {
  all: {
    icon: ImagesSquare,
    title: "Nothing here yet",
    body: "Drop photos anywhere on this page, or use Upload. They land in DarkDrive under My Photos and share your storage.",
  },
  favorites: {
    icon: Star,
    title: "No favorites",
    body: "Press F while viewing a photo, or pick some and hit the star.",
  },
  trash: {
    icon: Trash,
    title: "The bin is empty",
    body: "Photos you delete wait here until you empty the bin from DarkDrive.",
  },
}

export function TimelinePage({ filter }: { filter: Filter }) {
  const { items, loading, nextOffset, loadTimeline, loadMore } = useGallery()
  const [density, setDensity] = useDensity()
  const [open, setOpen] = useState<number | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadTimeline(filter)
  }, [filter, loadTimeline])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    // Fires while the sentinel is still a screen below the fold, so the next
    // page is usually in hand before the scroll reaches it.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadMore()
      },
      { rootMargin: "800px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore])

  const empty = EMPTY[filter]
  const Icon = empty.icon

  return (
    <>
      <div className="flex items-center justify-between px-3 pt-2 sm:px-5">
        <h1 className="font-serif text-2xl tracking-tight">
          {filter === "all" ? "Photos" : filter === "favorites" ? "Favorites" : "Bin"}
        </h1>
        <div className="bg-card flex rounded-full p-0.5">
          {(["s", "m", "l"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDensity(d)}
              aria-label={`${d === "s" ? "Small" : d === "m" ? "Medium" : "Large"} tiles`}
              className={[
                "grid size-8 place-items-center rounded-full transition-colors",
                density === d ? "bg-primary/20 text-primary" : "text-muted-foreground",
              ].join(" ")}
            >
              <SquaresFour size={d === "s" ? 14 : d === "m" ? 17 : 20} weight="fill" />
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 && !loading ? (
        <div className="grid place-items-center px-6 py-32 text-center">
          <Icon size={44} weight="light" className="text-muted-foreground/60 mb-4" />
          <h2 className="font-serif text-xl">{empty.title}</h2>
          <p className="text-muted-foreground mt-2 max-w-sm text-sm">{empty.body}</p>
        </div>
      ) : (
        <PhotoGrid items={items} density={density} onOpen={setOpen} />
      )}

      <div ref={sentinel} className="h-1" />
      {loading && (
        <p className="text-muted-foreground pb-10 text-center text-xs tracking-widest uppercase">
          Loading…
        </p>
      )}
      {!loading && nextOffset === null && items.length > 0 && (
        <p className="text-muted-foreground/50 pb-10 text-center text-xs tracking-widest uppercase">
          {items.length} {items.length === 1 ? "item" : "items"}
        </p>
      )}

      <SelectionBar mode={filter === "trash" ? "trash" : "library"} />

      {open !== null && (
        <Lightbox
          items={items}
          index={Math.min(open, items.length - 1)}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}
