export type NavKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End"

export const NAV_KEYS: readonly NavKey[] = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]

// Column count an `auto-fill, minmax(minColPx, 1fr)` CSS grid settles on for
// a given container width — lets ↑/↓ skip by a full row instead of walking
// the flat item order.
export function gridColumns(containerWidth: number, minColPx: number, gapPx = 12): number {
  if (containerWidth <= 0) return 1
  return Math.max(1, Math.floor((containerWidth + gapPx) / (minColPx + gapPx)))
}

// Next index into a flat, row-major item list for an arrow/Home/End keypress
// over a grid with `columns` columns (columns=1 degenerates to a plain list).
export function gridNavIndex(key: NavKey, idx: number, length: number, columns: number): number {
  if (length === 0) return -1
  const cur = idx < 0 ? 0 : idx
  switch (key) {
    case "Home":
      return 0
    case "End":
      return length - 1
    case "ArrowLeft":
      return idx < 0 ? 0 : Math.max(0, cur - 1)
    case "ArrowRight":
      return idx < 0 ? 0 : Math.min(length - 1, cur + 1)
    case "ArrowUp":
      return idx < 0 ? 0 : Math.max(0, cur - columns)
    case "ArrowDown":
      return idx < 0 ? 0 : Math.min(length - 1, cur + columns)
  }
}
