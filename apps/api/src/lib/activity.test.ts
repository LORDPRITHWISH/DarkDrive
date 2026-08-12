// Run: npx tsx src/lib/activity.test.ts
import assert from "node:assert/strict"
import { mergeActivityEvents, type ActivityEvent } from "./activity.js"

const ev = (at: string, action: string): ActivityEvent => ({ action, at, user: null })

// Interleaves two already-desc-sorted lists into one desc-sorted, capped feed.
const merged = mergeActivityEvents(
  [ev("2026-01-03T00:00:00Z", "download"), ev("2026-01-01T00:00:00Z", "view")],
  [ev("2026-01-02T00:00:00Z", "rename"), ev("2025-12-31T00:00:00Z", "upload")],
  10
)
assert.deepEqual(
  merged.map((e) => e.action),
  ["download", "rename", "view", "upload"]
)

// Respects the limit after merging, keeping the newest.
const capped = mergeActivityEvents(
  [ev("2026-01-01T00:00:00Z", "view")],
  [ev("2026-01-02T00:00:00Z", "rename")],
  1
)
assert.deepEqual(capped.map((e) => e.action), ["rename"])

console.log("ok")
