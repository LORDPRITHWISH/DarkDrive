// Run: npx tsx src/lib/tempCode.test.ts
// Temp-session codes are a login credential — a format drift here either
// breaks every typed code or quietly shrinks the keyspace.
import assert from "node:assert/strict"
import { newTempCode, normalizeTempCode } from "./tempCode.js"

const seen = new Set<string>()
for (let i = 0; i < 2000; i++) {
  const c = newTempCode()
  assert.match(c, /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/)
  seen.add(normalizeTempCode(c))
}
assert.equal(seen.size, 2000, "codes should not collide")

// What a user might actually type for "K7QM2-XP9RT".
for (const typed of ["K7QM2-XP9RT", "k7qm2xp9rt", " k7qm2 xp9rt ", "K7QM2—XP9RT"]) {
  assert.equal(normalizeTempCode(typed), "K7QM2XP9RT")
}

console.log("tempCode: ok")
