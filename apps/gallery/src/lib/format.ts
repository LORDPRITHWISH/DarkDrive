import type { Item } from "./types"

// Everything here formats in UTC on purpose. The server stores an EXIF capture
// time as the wall clock the camera recorded, tagged UTC (see api's lib/exif),
// so rendering in UTC is what keeps a photo on the day it was actually taken
// no matter where it is being looked at from.
const UTC = { timeZone: "UTC" } as const

export function formatBytes(n: number): string {
  if (!n) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const v = n / 1024 ** i
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    ...UTC,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { ...UTC, hour: "numeric", minute: "2-digit" })
}

export type Section = { key: string; label: string; items: Item[] }

/**
 * Splits an already-newest-first list into month sections for the timeline's
 * sticky headers. The current year is left off its own labels — it is the
 * year everything defaults to, so printing it adds noise, and a photo from
 * any other year is exactly the case where the year matters.
 */
export function groupByMonth(items: Item[], now = new Date()): Section[] {
  const sections: Section[] = []
  for (const item of items) {
    const d = new Date(item.at)
    // A row with an unparseable date would otherwise open a section headed
    // "Invalid Date" and swallow everything after it.
    const valid = !Number.isNaN(d.getTime())
    const key = valid ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` : "unknown"
    const last = sections[sections.length - 1]
    if (last?.key === key) {
      last.items.push(item)
      continue
    }
    sections.push({
      key,
      label: !valid
        ? "Undated"
        : d.toLocaleDateString(undefined, {
            ...UTC,
            month: "long",
            ...(d.getUTCFullYear() === now.getUTCFullYear() ? {} : { year: "numeric" }),
          }),
      items: [item],
    })
  }
  return sections
}
