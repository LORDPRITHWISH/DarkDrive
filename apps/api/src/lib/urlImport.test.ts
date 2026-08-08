// Run: npx tsx src/lib/urlImport.test.ts
// Guards the SSRF address filter — a break here means /files/import-url can
// be pointed at the internal network or the cloud metadata endpoint.
import assert from "node:assert/strict"
import { isBlockedAddress } from "./urlImport.js"

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

console.log("ok")
