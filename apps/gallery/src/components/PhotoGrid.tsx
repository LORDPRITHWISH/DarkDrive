import { useEffect, useRef, useState } from "react"
import { CheckCircle, PlayCircle, Star } from "@phosphor-icons/react"
import { thumbUrl } from "@/lib/api"
import { groupByMonth } from "@/lib/format"
import { isVideo, type Item } from "@/lib/types"
import { useGallery } from "@/store/gallery"

// Minimum tile width per density step. The grid stretches these to fill the
// row, so on a wide screen "small" is a contact sheet and "large" is a few
// photos you can actually read.
const DENSITY = { s: 96, m: 148, l: 232 } as const
export type Density = keyof typeof DENSITY
const DENSITY_KEY = "dg.density"

export function useDensity() {
  const [density, setDensity] = useState<Density>(() => {
    const v = localStorage.getItem(DENSITY_KEY)
    return v === "s" || v === "m" || v === "l" ? v : "m"
  })
  useEffect(() => {
    localStorage.setItem(DENSITY_KEY, density)
  }, [density])
  return [density, setDensity] as const
}

/**
 * The contact sheet. Sections are month-headed and the tiles butt up against
 * each other — at this size the photos themselves carry the layout, so the
 * chrome is a hairline gutter and nothing else.
 */
export function PhotoGrid({
  items,
  density = "m",
  onOpen,
}: {
  items: Item[]
  density?: Density
  onOpen: (index: number) => void
}) {
  const { selected, toggleSelect, selectMany } = useGallery()
  // Anchor for shift-click ranges, as an index into the flat list.
  const anchor = useRef<number | null>(null)
  const sections = groupByMonth(items)
  let flatIndex = 0

  const activate = (index: number, shiftKey: boolean) => {
    const item = items[index]
    if (shiftKey && anchor.current !== null) {
      const [from, to] = [anchor.current, index].sort((a, b) => a - b)
      selectMany(items.slice(from, to + 1).map((i) => i.id))
      return
    }
    // Once anything is selected, the grid is in selection mode and a plain
    // click keeps picking rather than opening the viewer.
    if (selected.size > 0) {
      anchor.current = index
      toggleSelect(item.id)
      return
    }
    onOpen(index)
  }

  return (
    <div className="px-3 pb-24 sm:px-5">
      {sections.map((section) => (
        <section key={section.key}>
          <h2 className="bg-background/70 text-muted-foreground sticky top-14 z-20 -mx-1 px-1 py-3 font-serif text-sm tracking-[0.18em] uppercase backdrop-blur-xl">
            {section.label}
          </h2>
          <div
            className="grid"
            style={{
              gap: "var(--tile-gap)",
              gridTemplateColumns: `repeat(auto-fill, minmax(${DENSITY[density]}px, 1fr))`,
            }}
          >
            {section.items.map((item) => {
              const index = flatIndex++
              return (
                <Tile
                  key={item.id}
                  item={item}
                  isSelected={selected.has(item.id)}
                  anySelected={selected.size > 0}
                  onActivate={(shiftKey) => activate(index, shiftKey)}
                  onPick={() => {
                    anchor.current = index
                    toggleSelect(item.id)
                  }}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function Tile({
  item,
  isSelected,
  anySelected,
  onActivate,
  onPick,
}: {
  item: Item
  isSelected: boolean
  anySelected: boolean
  onActivate: (shiftKey: boolean) => void
  onPick: () => void
}) {
  const [failed, setFailed] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onActivate(e.shiftKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onActivate(e.shiftKey)
        }
      }}
      className={[
        "group bg-card relative aspect-square cursor-pointer overflow-hidden outline-none",
        "focus-visible:ring-primary focus-visible:z-10 focus-visible:ring-2",
        isSelected ? "ring-primary z-10 scale-[0.9] rounded-lg ring-2" : "",
        "transition-transform duration-150",
      ].join(" ")}
      style={{ animation: "tile-in 240ms ease-out both" }}
    >
      {failed ? (
        <div className="text-muted-foreground grid h-full w-full place-items-center text-[10px]">
          no preview
        </div>
      ) : (
        <img
          src={thumbUrl(item.id)}
          alt={item.name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={[
            "h-full w-full object-cover transition-[transform,filter] duration-300",
            isSelected ? "brightness-90" : "group-hover:scale-[1.03]",
          ].join(" ")}
        />
      )}

      {/* Scrim only under the badges — a full overlay would grey out the photo. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/45 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <button
        onClick={(e) => {
          e.stopPropagation()
          onPick()
        }}
        aria-label={isSelected ? "Deselect" : "Select"}
        className={[
          "absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full transition-opacity",
          isSelected || anySelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        ].join(" ")}
      >
        <CheckCircle
          size={22}
          weight={isSelected ? "fill" : "regular"}
          className={isSelected ? "text-primary drop-shadow" : "text-white/90 drop-shadow"}
        />
      </button>

      {item.isStarred && (
        <Star
          size={16}
          weight="fill"
          className="absolute right-1.5 bottom-1.5 text-white drop-shadow"
        />
      )}
      {isVideo(item) && (
        <PlayCircle
          size={26}
          weight="fill"
          className="pointer-events-none absolute inset-0 m-auto text-white/85 drop-shadow"
        />
      )}
    </div>
  )
}
