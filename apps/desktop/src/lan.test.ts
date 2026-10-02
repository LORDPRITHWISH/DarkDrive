// Run with `pnpm test`. Two computers on one account find each other and one
// serves the other a file; a third, on another account, gets nowhere.
import assert from "node:assert"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { start, type Lan } from "./lan.js"

if (!Object.values(os.networkInterfaces()).flat().some((a) => a?.family === "IPv4" && !a.internal)) {
  console.log("lan skipped: no network to broadcast on")
  process.exit(0)
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-lan-"))
const file = path.join(dir, "a.bin")
const bytes = crypto.randomBytes(300_000)
fs.writeFileSync(file, bytes)
const sha = crypto.createHash("sha256").update(bytes).digest("hex")

// Off the real port, so a running DarkDrive isn't part of this.
const node = (key: string, files: [string, string][]) => {
  let lan: Lan | null = null
  const it = start({ key: async () => key, files: () => files, onChange: (l) => (lan = l), port: 47611 })
  return { ...it, lan: () => lan }
}
const a = node("one", [[sha, file]])
const b = node("one", [])
const stranger = node("two", [])

/** What a daemon does with a Lan (fromLan in apps/sync): the bytes, or null. */
async function fetchBlob(lan: Lan, sha: string): Promise<Buffer | null> {
  const tag = crypto.createHmac("sha256", Buffer.from(lan.tagKey, "hex")).update(sha).digest("hex")
  for (const host of lan.hosts) {
    const res = await fetch(`http://${host}/blob/${tag}`)
    if (!res.ok) continue
    const iv = Buffer.from(res.headers.get("x-iv") ?? "", "hex")
    const plain = crypto.createDecipheriv("aes-256-ctr", Buffer.from(lan.encKey, "hex"), iv)
    const got = Buffer.concat([plain.update(Buffer.from(await res.arrayBuffer())), plain.final()])
    if (crypto.createHash("sha256").update(got).digest("hex") === sha) return got
  }
  return null
}

for (let i = 0; i < 50 && !(a.lan()?.hosts.length && b.lan()?.hosts.length); i++) await new Promise((r) => setTimeout(r, 100))
// One address per network the two share, and this one computer shares them all.
assert(a.lan()?.hosts.length && b.lan()?.hosts.length, "a and b should find each other")
assert.equal(stranger.lan()?.hosts.length, 0, "another account's computer is nobody's peer")

assert((await fetchBlob(b.lan()!, sha))?.equals(bytes), "b gets a's file, intact")
assert.equal(await fetchBlob(b.lan()!, "0".repeat(64)), null, "a file a doesn't have")
// Knowing where a is isn't enough: without the account's key there's no
// asking for the file, and no reading it.
assert.equal(await fetchBlob({ ...stranger.lan()!, hosts: b.lan()!.hosts }, sha), null)

// Synced a moment ago, so not in the daemon's state file yet.
const fresh = path.join(dir, "b.bin")
fs.writeFileSync(fresh, "new")
const freshSha = crypto.createHash("sha256").update("new").digest("hex")
a.add(freshSha, fresh)
assert.equal((await fetchBlob(b.lan()!, freshSha))?.toString(), "new")

fs.rmSync(dir, { recursive: true })
console.log("lan ok")
process.exit(0)
