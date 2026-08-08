import dns from "node:dns"
import net from "node:net"
import http from "node:http"
import https from "node:https"
import fs from "node:fs"

const MAX_REDIRECTS = 5
// Big videos are slow — give an import plenty of room before giving up.
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

// This fetches wherever the user points it, server-side — the classic SSRF
// vector (internal services, cloud metadata at 169.254.169.254, etc). Every
// hostname/redirect hop is resolved and checked here before we ever connect.
function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return true
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === "::1" || lower === "::") return true
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true // fc00::/7 ULA
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
  if (mapped) return isBlockedIPv4(mapped[1])
  return false
}

export function isBlockedAddress(ip: string): boolean {
  return net.isIP(ip) === 4 ? isBlockedIPv4(ip) : isBlockedIPv6(ip)
}

// Resolves once and returns the vetted address — the caller then pins the
// connection to exactly this IP, so there's no DNS-rebinding gap between
// the check and the actual request.
async function resolveSafe(hostname: string): Promise<string> {
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new Error("blocked_address")
    return hostname
  }
  const { address } = await dns.promises.lookup(hostname)
  if (isBlockedAddress(address)) throw new Error("blocked_address")
  return address
}

export type ImportResult = { size: number; mimeType: string | null; suggestedName: string | null }

// How often to report progress, at most — the remote can push data far
// faster than a socket event is worth emitting.
const PROGRESS_INTERVAL_MS = 250

// Pulls the real filename out of Content-Disposition — signed CDN URLs (the
// kind this is mostly used for) have opaque token paths, so the URL itself
// rarely has a usable name and this header is often the only real source.
export function contentDispositionName(header?: string): string | null {
  if (!header) return null
  const utf8 = /filename\*=(?:UTF-8''|utf-8'')?([^;]+)/i.exec(header)
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ""))
    } catch {}
  }
  const quoted = /filename="([^"]*)"/i.exec(header)
  if (quoted) return quoted[1]
  const bare = /filename=([^;]+)/i.exec(header)
  if (bare) return bare[1].trim()
  return null
}

export async function importUrlToFile(
  startUrl: string,
  destPath: string,
  opts: {
    maxBytes: number
    timeoutMs?: number
    // `name` is only ever passed on the very first call (once headers are
    // in) — later throttled ticks just report bytes.
    onProgress?: (received: number, total: number | null, name?: string) => void
  }
): Promise<ImportResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let current = new URL(startUrl)

  for (let hop = 0; ; hop++) {
    if (hop > MAX_REDIRECTS) throw new Error("too_many_redirects")
    if (current.protocol !== "http:" && current.protocol !== "https:")
      throw new Error("unsupported_protocol")

    const pinnedIp = await resolveSafe(current.hostname)
    const mod = current.protocol === "https:" ? https : http

    const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = mod.request(
        current,
        {
          // Node's Happy Eyeballs connection logic (default since v20) calls
          // this with `{ all: true }` and expects an address array back, not
          // just the legacy single-address callback — handle both forms.
          lookup: (_hostname, opts: any, cb: any) => {
            const family = net.isIP(pinnedIp) as 4 | 6
            if (opts?.all) return cb(null, [{ address: pinnedIp, family }])
            return cb(null, pinnedIp, family)
          },
          headers: { "User-Agent": "DarkDrive-URLImport/1.0" },
          timeout: timeoutMs,
        },
        resolve
      )
      req.on("timeout", () => req.destroy(new Error("timeout")))
      req.on("error", reject)
      req.end()
    })

    if (
      response.statusCode &&
      response.statusCode >= 300 &&
      response.statusCode < 400 &&
      response.headers.location
    ) {
      response.resume() // discard body, follow redirect
      current = new URL(response.headers.location, current)
      continue
    }

    if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
      response.resume()
      throw new Error(`upstream_status_${response.statusCode ?? "none"}`)
    }

    const contentLength = Number(response.headers["content-length"])
    if (Number.isFinite(contentLength) && contentLength > opts.maxBytes) {
      response.resume()
      throw new Error("too_large")
    }
    const total = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null
    const mimeType = response.headers["content-type"]?.split(";")[0]?.trim() || null
    const suggestedName = contentDispositionName(response.headers["content-disposition"])

    let received = 0
    let lastProgressAt = 0
    opts.onProgress?.(0, total, suggestedName ?? undefined)
    const out = fs.createWriteStream(destPath)
    try {
      await new Promise<void>((resolve, reject) => {
        response.on("data", (chunk: Buffer) => {
          received += chunk.length
          if (received > opts.maxBytes) {
            response.destroy()
            reject(new Error("too_large"))
            return
          }
          const now = Date.now()
          if (now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
            lastProgressAt = now
            opts.onProgress?.(received, total)
          }
          if (!out.write(chunk)) response.pause()
        })
        out.on("drain", () => response.resume())
        response.on("end", () => out.end(() => resolve()))
        response.on("error", reject)
        out.on("error", reject)
      })
    } catch (err) {
      out.destroy()
      throw err
    }

    return { size: received, mimeType, suggestedName }
  }
}
