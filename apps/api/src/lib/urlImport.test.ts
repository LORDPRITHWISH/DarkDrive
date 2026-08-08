// Run: npx tsx src/lib/urlImport.test.ts
// Guards the SSRF address filter — a break here means /files/import-url can
// be pointed at the internal network or the cloud metadata endpoint.
import assert from "node:assert/strict"
import { isBlockedAddress, contentDispositionName } from "./urlImport.js"

const BLOCKED = [
  "127.0.0.1", // loopback
  "169.254.169.254", // cloud metadata
  "10.1.2.3",
  "172.16.0.1",
  "172.31.255.255",
  "192.168.1.1",
  "100.64.0.1", // CGNAT
  "0.0.0.0",
  "224.0.0.1", // multicast
  "::1",
  "fe80::1", // link-local
  "fc00::1", // ULA
  "fd12:3456::1", // ULA
  "::ffff:127.0.0.1", // IPv4-mapped loopback
]

const ALLOWED = [
  "8.8.8.8",
  "1.1.1.1",
  "172.32.0.1", // just outside the 172.16.0.0/12 block
  "2606:4700:4700::1111", // public IPv6 (Cloudflare)
]

for (const ip of BLOCKED) assert.equal(isBlockedAddress(ip), true, `should block ${ip}`)
for (const ip of ALLOWED) assert.equal(isBlockedAddress(ip), false, `should allow ${ip}`)

// Guards the filename fallback — a break here means imports from CDNs with
// opaque URL paths (the common case) land in the drive unnamed/misnamed.
assert.equal(contentDispositionName(undefined), null)
assert.equal(contentDispositionName('attachment; filename="video.mp4"'), "video.mp4")
assert.equal(contentDispositionName("attachment; filename=report.pdf"), "report.pdf")
assert.equal(
  contentDispositionName("attachment; filename*=UTF-8''caf%C3%A9%20menu.pdf"),
  "café menu.pdf"
)
assert.equal(
  contentDispositionName(
    "attachment; filename=\"fallback.txt\"; filename*=UTF-8''real%20name.txt"
  ),
  "real name.txt"
)

console.log("ok")
