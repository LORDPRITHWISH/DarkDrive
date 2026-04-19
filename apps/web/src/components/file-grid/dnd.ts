export const DRAG_MIME = "application/x-darkdrive-item"

export type DragPayload = { type: "folder" | "file"; id: string }

export function startItemDrag(e: React.DragEvent, payload: DragPayload) {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
  e.dataTransfer.effectAllowed = "move"
  // Browsers can produce a blank drag image when the source has transparent
  // backgrounds or backdrop filters. Pin the snapshot to the element itself.
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  e.dataTransfer.setDragImage(el, e.clientX - rect.left, e.clientY - rect.top)
}

export function readItemDrag(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(DRAG_MIME)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DragPayload
  } catch {
    return null
  }
}

export function isInternalDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(DRAG_MIME)
}
