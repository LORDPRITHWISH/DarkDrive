import { useEffect, type RefObject } from "react"
import { gridNavIndex, NAV_KEYS, type NavKey } from "./gridNav"

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex="0"]'

// Lets arrow keys move real DOM focus between a container's focusable
// children (cards rendered as <button>/<Link>, or rows opted in with
// tabIndex={0}) based on their on-screen row rather than tab order — the
// spatial navigation shortcut file managers offer. Column count is measured
// from actual layout, so it adapts to responsive auto-fill grids and to
// single-column lists alike.
export function useGridKeyNav(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    function onKeyDown(e: KeyboardEvent) {
      const key = e.key as NavKey
      if (!NAV_KEYS.includes(key)) return
      const active = document.activeElement as HTMLElement | null
      if (!active || !el!.contains(active)) return
      const items = Array.from(el!.querySelectorAll<HTMLElement>(FOCUSABLE))
      const idx = items.indexOf(active)
      if (idx === -1) return

      if (key !== "ArrowUp" && key !== "ArrowDown") {
        const next = gridNavIndex(key, idx, items.length, 1)
        e.preventDefault()
        items[next]?.focus()
        return
      }

      // Group into visual rows by rounded top offset, then jump to the
      // neighboring row's item closest to the current x position.
      const rects = items.map((it) => it.getBoundingClientRect())
      const rows: number[][] = []
      rects.forEach((r, i) => {
        const top = Math.round(r.top)
        const row = rows.find((row) => Math.abs(rects[row[0]].top - top) < 4)
        if (row) row.push(i)
        else rows.push([i])
      })
      rows.sort((a, b) => rects[a[0]].top - rects[b[0]].top)
      const curRow = rows.findIndex((row) => row.includes(idx))
      const targetRow = key === "ArrowDown" ? rows[curRow + 1] : rows[curRow - 1]
      if (!targetRow) return
      const curLeft = rects[idx].left
      const bestI = targetRow.reduce((best, i) =>
        Math.abs(rects[i].left - curLeft) < Math.abs(rects[best].left - curLeft) ? i : best
      , targetRow[0])
      e.preventDefault()
      items[bestI]?.focus()
    }

    el.addEventListener("keydown", onKeyDown)
    return () => el.removeEventListener("keydown", onKeyDown)
  }, [ref])
}
