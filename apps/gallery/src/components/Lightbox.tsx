import { useEffect, useState } from "react"
import {
  CaretLeft,
  CaretRight,
  DownloadSimple,
  Info,
  Star,
  Trash,
  X,
} from "@phosphor-icons/react"
import { downloadUrl, fullUrl } from "@/lib/api"
import { formatBytes, formatDay, formatTime } from "@/lib/format"
import { isVideo, type Item } from "@/lib/types"
import { useGallery } from "@/store/gallery"

/**
 * Full-frame viewer. The chrome is deliberately unlit — controls sit on the
 * black surround rather than on top of the picture, so nothing competes with
 * what is being looked at.
 */
export function Lightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: Item[]
  index: number
  onIndex: (next: number) => void
  onClose: () => void
}) {
  const { setStarred, setTrashed } = useGallery()
  const [showInfo, setShowInfo] = useState(false)
  const item = items[index]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1)
      else if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1)
      else if (e.key === "i") setShowInfo((v) => !v)
      else if (e.key === "f" && item) void setStarred([item.id], !item.isStarred)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    // The page behind must not scroll while the viewer owns the screen.
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
    }
  }, [index, items.length, item, onIndex, onClose, setStarred])

  if (!item) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/97 backdrop-blur-sm">
      <div className="flex h-14 shrink-0 items-center gap-1 px-3 text-white/80">
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid size-10 place-items-center rounded-full transition-colors hover:bg-white/10"
        >
          <X size={20} />
        </button>
        <div className="min-w-0 flex-1 px-2">
          <p className="truncate text-sm">{item.name}</p>
          <p className="text-xs text-white/45">
            {formatDay(item.at)} · {formatTime(item.at)}
          </p>
        </div>
        <button
          onClick={() => void setStarred([item.id], !item.isStarred)}
          aria-label={item.isStarred ? "Remove favorite" : "Favorite"}
          className="grid size-10 place-items-center rounded-full transition-colors hover:bg-white/10"
        >
          <Star size={20} weight={item.isStarred ? "fill" : "regular"} className={item.isStarred ? "text-primary" : ""} />
        </button>
        <button
          onClick={() => setShowInfo((v) => !v)}
          aria-label="Info"
          className="grid size-10 place-items-center rounded-full transition-colors hover:bg-white/10"
        >
          <Info size={20} weight={showInfo ? "fill" : "regular"} />
        </button>
        <a
          href={downloadUrl(item.id)}
          aria-label="Download"
          className="grid size-10 place-items-center rounded-full transition-colors hover:bg-white/10"
        >
          <DownloadSimple size={20} />
        </a>
        <button
          onClick={async () => {
            await setTrashed([item.id], !item.isTrashed)
            // The list this viewer is walking just lost an item; stepping back
            // keeps the next photo under the same finger.
            if (items.length <= 1) onClose()
            else onIndex(Math.min(index, items.length - 2))
          }}
          aria-label={item.isTrashed ? "Restore" : "Move to bin"}
          className="grid size-10 place-items-center rounded-full transition-colors hover:bg-white/10"
        >
          <Trash size={20} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {index > 0 && (
          <Arrow side="left" onClick={() => onIndex(index - 1)} />
        )}
        {isVideo(item) ? (
          <video
            key={item.id}
            src={fullUrl(item.id)}
            controls
            autoPlay
            className="max-h-full max-w-full"
          />
        ) : (
          <img
            key={item.id}
            src={fullUrl(item.id)}
            alt={item.name}
            className="max-h-full max-w-full object-contain"
            style={{ animation: "tile-in 200ms ease-out both" }}
          />
        )}
        {index < items.length - 1 && (
          <Arrow side="right" onClick={() => onIndex(index + 1)} />
        )}

        {showInfo && (
          <aside className="absolute inset-y-0 right-0 w-72 space-y-4 overflow-auto border-l border-white/10 bg-black/80 p-5 text-sm text-white/80">
            <h3 className="font-serif text-base text-white">Details</h3>
            <Detail label="Name" value={item.name} />
            <Detail label="Taken" value={`${formatDay(item.at)} · ${formatTime(item.at)}`} />
            {!item.takenAt && (
              <p className="text-xs text-white/40">
                No capture date in the file — showing when it was uploaded.
              </p>
            )}
            <Detail label="Size" value={formatBytes(item.size)} />
            <Detail label="Type" value={item.mimeType} />
          </aside>
        )}
      </div>

      <p className="text-center text-xs text-white/25 pb-3">
        ← → to move · F to favorite · I for details · Esc to close
      </p>
    </div>
  )
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? CaretLeft : CaretRight
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={[
        "absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full",
        "bg-black/40 text-white/70 transition-colors hover:bg-white/15 hover:text-white",
        side === "left" ? "left-3" : "right-3",
      ].join(" ")}
    >
      <Icon size={22} weight="bold" />
    </button>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.15em] text-white/40 uppercase">{label}</p>
      <p className="mt-0.5 break-words">{value}</p>
    </div>
  )
}
