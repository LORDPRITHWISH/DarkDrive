// Run: npx tsx src/lib/logbuf.test.ts
// Guards the admin log ring: if the console patch or the cap breaks, the admin
// panel silently shows nothing (or the process leaks memory holding every line).
import assert from "node:assert/strict"
import { recentLogs } from "./logbuf.js"

console.log("[thumb] hello", { a: 1 })
console.error("boom", new Error("kaput"))

const after = recentLogs()
assert.equal(after.at(-2)?.level, "log")
assert.equal(after.at(-2)?.msg, '[thumb] hello {"a":1}')
assert.equal(after.at(-1)?.level, "error")
assert.ok(after.at(-1)?.msg.startsWith("boom Error: kaput"))

// Ring stays capped and keeps the newest lines.
for (let i = 0; i < 1000; i++) console.log(`line ${i}`)
const capped = recentLogs()
assert.ok(capped.length <= 800, `ring not capped: ${capped.length}`)
assert.equal(capped.at(-1)?.msg, "line 999")

process.stdout.write("logbuf: ok\n")
