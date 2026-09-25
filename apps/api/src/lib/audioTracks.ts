import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { storage, newScratchPath } from "../storage/index.js"
import { run } from "./thumbnails.js"

export type AudioStreamInfo = {
  index: number
  label: string
}

const PROBE_TIMEOUT = 10_000
// A whole-file remux (video copy, audio re-encode) is bounded by how fast
// ffmpeg can encode the audio track for the full duration, not by file size —
// generous headroom for long/large uploads on modest hardware.
const REMUX_TIMEOUT = 10 * 60_000

type ProbeStream = {
  index: number
  channels?: number
  tags?: { language?: string; title?: string }
}

// Lists the audio streams embedded in a media file via ffprobe. Empty array on
// any failure (not a media file, ffprobe missing, etc.) — callers treat that
// the same as "nothing to pick from".
export function probeAudioStreams(absSrc: string): Promise<AudioStreamInfo[]> {
  return new Promise((resolve) => {
    let out = ""
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      "-select_streams",
      "a",
      absSrc,
    ])
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL")
      } catch {}
      resolve([])
    }, PROBE_TIMEOUT)
    child.stdout.on("data", (d) => (out += d))
    child.on("error", () => {
      clearTimeout(timer)
      resolve([])
    })
    child.on("close", () => {
      clearTimeout(timer)
      try {
        const parsed = JSON.parse(out) as { streams?: ProbeStream[] }
        const streams = parsed.streams ?? []
        resolve(
          streams.map((s, i) => ({
            index: s.index,
            label:
              s.tags?.title ||
              (s.tags?.language ? s.tags.language.toUpperCase() : `Audio ${i + 1}`),
          }))
        )
      } catch {
        resolve([])
      }
    })
  })
}

// --- tiny concurrency gate, separate from thumbnails' — these jobs process a
// whole file rather than one frame, so fewer run at once. -------------------
const MAX_CONCURRENT = 2
let active = 0
const waiters: Array<() => void> = []
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiters.push(r))
  active++
  try {
    return await fn()
  } finally {
    active--
    waiters.shift()?.()
  }
}

function derivedKey(fileId: string, streamIndex: number): string {
  return path.posix.join("derived-audio", fileId, `${streamIndex}.mp4`)
}

// In-flight registry so concurrent requests for the same (file, track) during
// initial playback/seeking share one ffmpeg run instead of racing.
const inflight = new Map<string, Promise<string | null>>()

// Remuxes the file so its only audio stream is `streamIndex` — the video is
// stream-copied (no re-encode), audio is re-encoded to AAC so playback works
// even when the source audio codec (AC3/DTS/etc.) isn't browser-playable.
// Cached on disk per (file, stream); generated once, reused after. Resolves
// the storage key, or null if ffmpeg couldn't produce it (bad index, no
// audio, etc.) — ffmpeg's own failure is the validation, no separate check.
export function getAudioVariant(
  fileId: string,
  sourceKey: string,
  streamIndex: number
): Promise<string | null> {
  const cacheId = `${fileId}:${streamIndex}`
  const existing = inflight.get(cacheId)
  if (existing) return existing
  const p = doGetVariant(fileId, sourceKey, streamIndex).finally(() =>
    inflight.delete(cacheId)
  )
  inflight.set(cacheId, p)
  return p
}

async function doGetVariant(
  fileId: string,
  sourceKey: string,
  streamIndex: number
): Promise<string | null> {
  const key = derivedKey(fileId, streamIndex)
  if (await storage.stat(key)) return key

  return withSlot(async () => {
    if (await storage.stat(key)) return key
    const local = await storage.localPath(sourceKey)
    if (!local) return null
    const out = newScratchPath()
    try {
      const ok = await run(
        "ffmpeg",
        [
          "-i",
          local.path,
          "-map",
          "0:v:0",
          "-map",
          `0:${streamIndex}`,
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-movflags",
          "+faststart",
          "-y",
          out,
        ],
        REMUX_TIMEOUT
      )
      if (!ok || !fs.existsSync(out) || fs.statSync(out).size === 0) return null
      await storage.putFile(key, out)
      return key
    } finally {
      local.cleanup()
      try {
        fs.rmSync(out, { force: true })
      } catch {}
    }
  })
}

// Drops every cached audio variant for a file — called when the file itself
// is purged so derivatives don't outlive it on disk.
export async function removeAudioVariants(fileId: string): Promise<void> {
  try {
    await storage.removePrefix(path.posix.join("derived-audio", fileId))
  } catch {}
}
