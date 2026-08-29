// Run: npx tsx src/lib/format.test.ts
import assert from "node:assert/strict"
import { groupByMonth, formatBytes } from "./format.js"
import type { Item } from "./types.js"

const at = (iso: string): Item => ({
  id: iso,
  name: "IMG.jpg",
  size: 1,
  mimeType: "image/jpeg",
  takenAt: iso,
  createdAt: iso,
  at: iso,
  isStarred: false,
  isTrashed: false,
  thumbnailState: "ready",
  sha256: null,
})

const now = new Date("2026-08-22T00:00:00Z")

// Consecutive items in the same month share one section; a new month opens
// the next one, in the order the server sent them.
const s = groupByMonth(
  [
    at("2026-08-20T10:00:00Z"),
    at("2026-08-01T10:00:00Z"),
    at("2026-07-31T23:00:00Z"),
    at("2025-08-02T10:00:00Z"),
  ],
  now
)
assert.deepEqual(
  s.map((x) => [x.key, x.items.length]),
  [
    ["2026-08", 2],
    ["2026-07", 1],
    ["2025-08", 1],
  ]
)
// The current year is implied; any other year is spelled out.
assert.equal(s[0].label, "August")
assert.equal(s[2].label, "August 2025")

// Month boundaries are UTC, matching how the capture time was stored — a
// 23:00 UTC shot on the 31st stays in its own month.
assert.equal(groupByMonth([at("2026-07-31T23:30:00Z")], now)[0].key, "2026-07")

// A bad date gets its own section instead of poisoning the rest of the list.
const bad = groupByMonth([at("not-a-date"), at("2026-08-20T10:00:00Z")], now)
assert.deepEqual(
  bad.map((x) => x.key),
  ["unknown", "2026-08"]
)
assert.equal(bad[0].label, "Undated")

assert.equal(formatBytes(0), "0 B")
assert.equal(formatBytes(900), "900 B")
assert.equal(formatBytes(1536), "1.5 KB")
assert.equal(formatBytes(5 * 1024 ** 3), "5.0 GB")

console.log("format ok")
