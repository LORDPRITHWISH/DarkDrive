// Run: npx tsx src/lib/shareInbox.test.ts
// Guards the SW <-> page wire format. A break here means shared files land in
// the drive under mangled names, which nothing else would catch.
import assert from "node:assert/strict"
import { shareKey, nameFromShareKey } from "./shareInbox.ts"

const NAMES = [
  "photo.jpg",
  "2024-annual-report.pdf", // leading digits + hyphens, vs the index prefix
  "holiday photos/beach.png", // slash must not create a fake path segment
  "50% off (final) v2.txt", // percent + parens
  "reçu-café.pdf", // non-ascii
  "-leading-hyphen.md",
  "123.txt", // all-digit stem
]

for (const [i, name] of NAMES.entries()) {
  const key = shareKey(i, name)
  assert.equal(nameFromShareKey(key), name, `path round-trip: ${name}`)
  // The page reads back absolute request URLs, not bare paths.
  assert.equal(
    nameFromShareKey(new URL(key, "https://darkdrive.zenux.live").href),
    name,
    `url round-trip: ${name}`
  )
}

// Distinct keys for duplicate names is the whole reason the index is there.
assert.notEqual(shareKey(0, "a.txt"), shareKey(1, "a.txt"))

console.log(`ok — ${NAMES.length} names round-trip`)
