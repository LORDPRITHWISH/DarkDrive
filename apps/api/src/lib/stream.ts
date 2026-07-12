import fs from "node:fs"
import type { Request, Response } from "express"
import { absolutePath } from "../storage/local.js"
import { allowFrameEmbedding } from "./embed.js"

type StreamTarget = {
  name: string
  mimeType: string
  storageKey: string
}

type StreamOptions = {
  disposition: "inline" | "attachment"
  // Override the on-the-wire content type (e.g. converted subtitles).
  contentType?: string
}

// Streams a stored file to the client with full HTTP Range support. Honoring
// `Range` is what lets the browser seek/scrub a <video> without downloading the
// whole file first — a plain pipe() advertises no `Accept-Ranges`, so players
// fall back to a single non-seekable stream.
export function streamStoredFile(
  req: Request,
  res: Response,
  file: StreamTarget,
  opts: StreamOptions
): void {
  const abs = absolutePath(file.storageKey)
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    res.status(410).json({ error: "gone" })
    return
  }
  if (!stat.isFile()) {
    res.status(410).json({ error: "gone" })
    return
  }

  const total = stat.size

  if (opts.disposition === "inline") allowFrameEmbedding(res)
  res.setHeader("Accept-Ranges", "bytes")
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Content-Type", opts.contentType ?? file.mimeType)
  res.setHeader(
    "Content-Disposition",
    `${opts.disposition}; filename="${encodeURIComponent(file.name)}"`
  )

  const rangeHeader = Array.isArray(req.headers.range)
    ? req.headers.range[0]
    : req.headers.range

  if (rangeHeader) {
    const parsed = parseRange(rangeHeader, total)
    if (!parsed) {
      res.status(416)
      res.setHeader("Content-Range", `bytes */${total}`)
      res.end()
      return
    }
    const { start, end } = parsed
    res.status(206)
    res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`)
    res.setHeader("Content-Length", end - start + 1)
    if (req.method === "HEAD") {
      res.end()
      return
    }
    pipeRange(res, abs, start, end)
    return
  }

  res.setHeader("Content-Length", total)
  if (req.method === "HEAD") {
    res.end()
    return
  }
  pipeRange(res, abs)
}

// Parses a single-range `bytes=start-end` header against a known total size.
// Supports open-ended (`bytes=500-`) and suffix (`bytes=-500`) forms. Returns
// null for syntactically invalid or unsatisfiable ranges. Multi-range requests
// are intentionally collapsed to the first range — sufficient for media seeking.
function parseRange(
  header: string,
  total: number
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)/.exec(header.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  if (rawStart === "" && rawEnd === "") return null
  if (total === 0) return null

  let start: number
  let end: number
  if (rawStart === "") {
    // Suffix: last N bytes.
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(total - suffix, 0)
    end = total - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === "" ? total - 1 : Number(rawEnd)
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start > end || start < 0 || start >= total) return null
  end = Math.min(end, total - 1)
  return { start, end }
}

function pipeRange(res: Response, abs: string, start?: number, end?: number) {
  const stream =
    start === undefined
      ? fs.createReadStream(abs)
      : fs.createReadStream(abs, { start, end })
  stream.on("error", () => {
    if (!res.headersSent) res.status(500)
    res.destroy()
  })
  res.on("close", () => stream.destroy())
  stream.pipe(res)
}
