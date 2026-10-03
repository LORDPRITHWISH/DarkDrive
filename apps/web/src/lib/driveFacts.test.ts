// Run: node --experimental-strip-types src/lib/driveFacts.test.ts
// Guards the arithmetic and the cases where a fact has to be dropped rather
// than printed as nonsense ("room for 0 more files", "100% is other").
import assert from "node:assert/strict"
import { driveFacts } from "./driveFacts.ts"
import type { QuotaInfo } from "./types.ts"

const GB = 1024 ** 3
const quota = (over: Partial<QuotaInfo> = {}): QuotaInfo => ({
  used: 398 * GB,
  total: 1000 * GB,
  role: "USER",
  upgradeRequestedAt: null,
  upgradeRequestedBytes: null,
  byType: { image: 2310, video: 642, audio: 418, doc: 1105, archive: 96, other: 241 },
  bytesByType: {
    image: 18.4 * GB,
    video: 352 * GB,
    audio: 6.1 * GB,
    doc: 3.2 * GB,
    archive: 14.7 * GB,
    other: 3.6 * GB,
  },
  ...over,
})

// A video-heavy drive gets all four.
assert.deepEqual(driveFacts(quota()), [
  "Burned to DVDs, your drive would be a stack of 91 discs.",
  "Saved to floppy disks, it would take 289,815 of them.",
  "You have room for about 7,278 more files the size of your average one.",
  "88% of your storage is video, from just 13% of your files.",
])

// An empty drive has nothing to say.
assert.deepEqual(driveFacts(quota({ used: 0 })), [])

// A full drive drops the "room for more" line.
assert.ok(!driveFacts(quota({ total: 398 * GB })).some((f) => f.includes("room for")))

// A small, evenly spread drive: one DVD, and no lopsided-category line.
const even = quota({
  used: 2 * GB,
  byType: { image: 10, video: 10, audio: 0, doc: 0, archive: 0, other: 0 },
  bytesByType: { image: GB, video: GB, audio: 0, doc: 0, archive: 0, other: 0 },
})
assert.equal(driveFacts(even)[0], "Your whole drive would fit on a single DVD.")
assert.equal(driveFacts(even).length, 3)

// "other" on top is never named.
const misc = quota({
  used: 10 * GB,
  byType: { image: 99, video: 0, audio: 0, doc: 0, archive: 0, other: 1 },
  bytesByType: { image: GB, video: 0, audio: 0, doc: 0, archive: 0, other: 9 * GB },
})
assert.ok(!driveFacts(misc).some((f) => f.includes("of your storage is")))

console.log("driveFacts: ok")
