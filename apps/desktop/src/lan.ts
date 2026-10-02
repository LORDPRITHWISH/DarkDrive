// LAN sync: when another computer on this network is signed in to the same
// account, a file comes straight from it instead of down from the server.
//
// The server stays the source of truth: the daemons still learn what changed
// from it, and still upload to it. This only swaps where a download's bytes
// come from (fromLan in apps/sync), and those count only if they hash to what
// the server said, so nothing a peer sends is taken on trust.
//
// Everything rests on the account's LAN key (GET /api/sync/lan-key), which
// only its own computers can get:
//   - finding each other: a UDP broadcast, signed with the key over the
//     sender's address, so nobody else can announce themselves as a peer or
//     replay one from a different machine;
//   - asking for a file: by an HMAC of its hash, so nobody else can ask for
//     anything, or learn from the traffic which files these are;
//   - the bytes: AES-256-CTR. Integrity is the hash check on the other end.
//
// No Electron in here, so lan.test.ts can run two of these in plain Node.
//
// ponytail: always on once signed in, on every network. Add a setting if
// people want it off on networks they don't trust.
import crypto from "node:crypto"
import dgram from "node:dgram"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import { pipeline } from "node:stream/promises"

const DISCOVERY_PORT = 47610
const ANNOUNCE_MS = 15_000
const PEER_TTL_MS = 50_000
// The key changes daily (see the route); asked for hourly so a new one is
// picked up without everyone needing to restart.
const KEY_MS = 60 * 60 * 1000
const REINDEX_MS = 10_000

/** What a daemon needs to fetch from peers. hosts are "ip:port"; the keys are hex. */
export type Lan = { hosts: string[]; tagKey: string; encKey: string }

type Options = {
  /** The account's LAN key, or null when signed out. Throws when the server can't be reached. */
  key(): Promise<string | null>
  /** Every synced file on this computer, as [sha256, absolute path]. */
  files(): Iterable<[string, string]>
  /** The peers or the key changed. null: LAN sync is off. */
  onChange(lan: Lan | null): void
  /** For the test, which can't share one port between two accounts' worth of nodes. */
  port?: number
}

const hmac = (key: crypto.BinaryLike, data: string) => crypto.createHmac("sha256", key).update(data).digest("hex")
const sameHex = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

function broadcastOf(address: string, netmask: string) {
  const mask = netmask.split(".").map(Number)
  return address.split(".").map((o, i) => Number(o) | (~mask[i] & 255)).join(".")
}

export function start(opts: Options) {
  const me = crypto.randomBytes(8).toString("hex")
  const udpPort = opts.port ?? DISCOVERY_PORT
  let key: string | null = null
  let keyAt = 0
  // One key, three uses: each gets its own, so none can stand in for another.
  let keys: { sign: string; tag: string; enc: string } | null = null
  // "ip:port" -> when it was last heard. By address, not by peer: one
  // reachable two ways (wifi and a cable) is just two places to try.
  const peers = new Map<string, number>()
  let blobs = new Map<string, string>()
  let indexedAt = 0

  const tagOf = (sha: string) => hmac(Buffer.from(keys!.tag, "hex"), sha)
  const changed = () =>
    opts.onChange(keys && { hosts: [...peers.keys()], tagKey: keys.tag, encKey: keys.enc })

  // ---------------------------------------------------------------- serving

  function find(tag: string): string | undefined {
    // A miss may just be a file synced since the last look. Not on every
    // miss, though: that's a walk of every folder's state per stranger's guess.
    if (!blobs.has(tag) && Date.now() - indexedAt > REINDEX_MS) {
      const fresh = new Map<string, string>()
      for (const [sha, abs] of opts.files()) fresh.set(tagOf(sha), abs)
      blobs = fresh
      indexedAt = Date.now()
    }
    return blobs.get(tag)
  }

  const server = http.createServer((req, res) => {
    const tag = /^\/blob\/([0-9a-f]{64})$/.exec(req.url ?? "")?.[1]
    const abs = tag && keys ? find(tag) : undefined
    // Moved or deleted since it was indexed: a clean miss. Edited since is
    // the asker's hash check to catch.
    if (!abs || !fs.statSync(abs, { throwIfNoEntry: false })?.isFile()) return void res.writeHead(404).end()
    const iv = crypto.randomBytes(16)
    res.writeHead(200, { "x-iv": iv.toString("hex") })
    const cipher = crypto.createCipheriv("aes-256-ctr", Buffer.from(keys!.enc, "hex"), iv)
    pipeline(fs.createReadStream(abs), cipher, res).catch(() => {})
  })
  // Without it LAN sync is just off: the announcements carry the port.
  server.on("error", () => {})
  server.listen(0)

  // -------------------------------------------------------------- discovery

  const udp = dgram.createSocket({ type: "udp4", reuseAddr: true })
  // Port taken, no network: nothing is found, and sync goes through the server.
  udp.on("error", () => {})

  function announce() {
    const port = (server.address() as { port: number } | null)?.port
    if (!keys || !port) return
    for (const list of Object.values(os.networkInterfaces()))
      for (const a of list ?? []) {
        if (a.family !== "IPv4" || a.internal) continue
        const msg = { id: me, port, addr: a.address, mac: hmac(keys.sign, `${me}|${a.address}|${port}`) }
        udp.send(JSON.stringify(msg), udpPort, broadcastOf(a.address, a.netmask), () => {})
      }
  }

  udp.on("message", (buf, from) => {
    if (!keys || buf.length > 512) return
    let m: { id?: unknown; port?: unknown; addr?: unknown; mac?: unknown }
    try {
      m = JSON.parse(buf.toString())
    } catch {
      return
    }
    if (typeof m.id !== "string" || typeof m.mac !== "string" || !Number.isInteger(m.port) || m.id === me) return
    // Signed over the address it says it's from, and that has to be where it
    // came from: a copy of someone's announcement sent from elsewhere fails.
    if (m.addr !== from.address || !sameHex(m.mac, hmac(keys.sign, `${m.id}|${m.addr}|${m.port}`))) return
    const host = `${from.address}:${m.port}`
    const known = peers.has(host)
    peers.set(host, Date.now())
    if (known) return
    changed()
    // Answer a newcomer now, so it needn't wait for our next round.
    announce()
  })

  async function loadKey() {
    let next: string | null
    try {
      next = await opts.key()
    } catch {
      return // offline: the one we have is good until the day ends
    }
    keyAt = Date.now()
    if (next === key) return
    key = next
    keys = next ? { sign: hmac(next, "sign"), tag: hmac(next, "tag"), enc: hmac(next, "enc") } : null
    peers.clear()
    blobs = new Map()
    indexedAt = 0
    changed()
  }

  async function tick() {
    if (Date.now() - keyAt > KEY_MS) await loadKey()
    let dropped = false
    for (const [host, seen] of peers)
      if (Date.now() - seen > PEER_TTL_MS) dropped = peers.delete(host)
    if (dropped) changed()
    announce()
  }

  udp.bind(udpPort, () => {
    udp.setBroadcast(true)
    void tick()
    setInterval(tick, ANNOUNCE_MS)
  })

  return {
    /** A file just synced: servable now, before the daemon's state file says so. */
    add(sha: string, abs: string) {
      if (keys) blobs.set(tagOf(sha), abs)
    },
    /** The account changed: its key, and so its peers, are different ones. */
    async refresh() {
      await loadKey()
      announce()
    },
  }
}
