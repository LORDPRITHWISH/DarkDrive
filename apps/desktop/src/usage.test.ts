// Run with `pnpm test`. A small tree, measured, then changed.
import assert from "node:assert"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { gone, measure, renamed, sizeOf } from "./usage.js"

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-usage-"))
const at = (...p: string[]) => path.join(dir, ...p)
fs.mkdirSync(at("a", "deep"), { recursive: true })
fs.mkdirSync(at("b"))
fs.writeFileSync(at("a", "one"), Buffer.alloc(100_000, 1))
fs.writeFileSync(at("a", "deep", "two"), Buffer.alloc(50_000, 1))
fs.writeFileSync(at("b", "three"), Buffer.alloc(10_000, 1))
// A link back to the top: followed, this would never end.
if (process.platform !== "win32") fs.symlinkSync(dir, at("a", "loop"))

const on = (p: string) => fs.lstatSync(p).blocks * 512
const [one, two, three] = [on(at("a", "one")), on(at("a", "deep", "two")), on(at("b", "three"))]
assert(one >= 100_000 && two >= 50_000)

assert.equal(await measure(dir), one + two + three)
assert.equal(sizeOf(at("a")), one + two)
assert.equal(sizeOf(at("a", "deep")), two)
assert.equal(sizeOf(at("b")), three)
assert.equal(sizeOf(at("a", "one")), undefined) // folders only

renamed(at("b"), at("c"))
assert.equal(sizeOf(at("b")), undefined)
assert.equal(sizeOf(at("c")), three)
assert.equal(sizeOf(dir), one + two + three)

gone(at("a", "deep"), two)
assert.equal(sizeOf(at("a", "deep")), undefined)
assert.equal(sizeOf(at("a")), one)
assert.equal(sizeOf(dir), one + three)

fs.rmSync(dir, { recursive: true })
console.log("usage ok")
