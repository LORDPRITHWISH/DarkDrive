export const DRAG_MIME = "application/x-darkdrive-item"

export type DragItem = { type: "folder" | "file"; id: string }

// A drag always carries a list — a single-item drag is just a list of one,
// so drop targets don't need to special-case the multi-select case.
export function startItemDrag(e: React.DragEvent, items: DragItem[]) {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(items))
  e.dataTransfer.effectAllowed = "move"

  if (items.length > 1) {
    // A single card snapshot doesn't convey "you're moving N things" — swap
    // in a small pill badge as the drag image instead, like Drive/Finder do.
    const badge = document.createElement("div")
    badge.textContent = `${items.length} items`
    badge.style.cssText =
      "position:fixed;top:-1000px;left:-1000px;padding:6px 14px;" +
      "border-radius:9999px;background:#111827;color:#fff;" +
      "font:600 12px system-ui,sans-serif;white-space:nowrap;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.35);"
    document.body.appendChild(badge)
    e.dataTransfer.setDragImage(badge, 16, 16)
    setTimeout(() => badge.remove(), 0)
    return
  }

  // Browsers can produce a blank drag image when the source has transparent
  // backgrounds or backdrop filters. Pin the snapshot to the element itself.
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  e.dataTransfer.setDragImage(el, e.clientX - rect.left, e.clientY - rect.top)
}

export function readItemDrag(e: React.DragEvent): DragItem[] | null {
  const raw = e.dataTransfer.getData(DRAG_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DragItem[]) : null
  } catch {
    return null
  }
}

export function isInternalDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(DRAG_MIME)
}
