import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { prisma } from "../db/prisma.js"
import {
  absolutePath,
  ensureDirFor,
  newStorageKey,
} from "../storage/local.js"

// Longest-edge of the generated thumbnail, in pixels, and JPEG quality. 512px
// is plenty for a grid card while staying small on disk / over the wire.
const THUMB_MAX = 512
const JPEG_QUALITY = 78

// Cap on how many generation jobs run at once. Thumbnailing spawns external
// processes (ffmpeg / libreoffice) that are CPU + memory heavy, so we serialize
// rather than fork one per file in a freshly-opened folder.
const MAX_CONCURRENT = 3

// Per-tool wall-clock limits. A wedged libreoffice/ffmpeg should fail the job
// and fall back to an icon, never hang a request or leak a process forever.
const TIMEOUT = { image: 30_000, video: 30_000, pdf: 30_000, office: 90_000 }

type ThumbKind = "image" | "video" | "pdf" | "office"

type ThumbFile = {
  id: string
  name: string
  mimeType: string
  storageKey: string
  thumbnailKey: string | null
  thumbnailState: string | null
}

function ext(name: string): string {
  return path.extname(name).toLowerCase()
}

// Classify a file into a thumbnail strategy, or null if we can't render one.
// Both mime type and extension are consulted — uploads often arrive with a
// generic `application/octet-stream` type, so the extension is the safety net.
export function thumbKind(file: { mimeType: string; name: string }): ThumbKind | null {
  const m = file.mimeType.toLowerCase()
  const e = ext(file.name)
  if (m.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|avif|ico|svg)$/.test(e))
    return "image"
  if (m.startsWith("video/") || /\.(mp4|mkv|webm|mov|avi|m4v|wmv|flv|mpe?g|3gp|ts)$/.test(e))
    return "video"
  if (m === "application/pdf" || e === ".pdf") return "pdf"
  if (
    /officedocument|ms-powerpoint|msword|ms-excel|opendocument/.test(m) ||
    /\.(docx?|pptx?|xlsx?|odt|odp|ods|odg|rtf)$/.test(e)
  )
    return "office"
  return null
}

export function canThumbnail(file: { mimeType: string; name: string }): boolean {
  return thumbKind(file) !== null
}

// --- tiny concurrency gate -------------------------------------------------
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

// --- process helpers -------------------------------------------------------
export function run(cmd: string, args: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "ignore" })
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(ok)
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL")
      } catch {}
      finish(false)
    }, timeoutMs)
    child.on("error", () => finish(false))
    child.on("close", (code) => finish(code === 0))
  })
}

function probeDuration(src: string): Promise<number> {
  return new Promise((resolve) => {
    let out = ""
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      src,
    ])
    child.stdout.on("data", (d) => (out += d))
    child.on("error", () => resolve(0))
    child.on("close", () => {
      const n = parseFloat(out.trim())
      resolve(Number.isFinite(n) && n > 0 ? n : 0)
    })
  })
}

// --- per-kind renderers ----------------------------------------------------
// Each writes a JPEG to `outJpg` and resolves true on success.

export async function renderImage(src: string, outJpg: string): Promise<boolean> {
  // `[0]` takes the first frame/page of multi-frame inputs (animated GIF, TIFF).
  // `-thumbnail WxH>` only shrinks (the `>`), preserving aspect ratio.
  return run(
    "convert",
    [
      `${src}[0]`,
      "-auto-orient",
      "-background",
      "white",
      "-flatten",
      "-thumbnail",
      `${THUMB_MAX}x${THUMB_MAX}>`,
      "-quality",
      String(JPEG_QUALITY),
      outJpg,
    ],
    TIMEOUT.image
  )
}

async function renderVideo(src: string, outJpg: string): Promise<boolean> {
  // Seek ~20% in so we skip black intros/fades but stay before any outro. Fast
  // input seeking (`-ss` before `-i`) keeps this cheap on large files.
  const dur = await probeDuration(src)
  const ts = dur > 0 ? Math.min(Math.max(dur * 0.2, 1), dur - 0.1) : 1
  return run(
    "ffmpeg",
    [
      "-ss",
      ts.toFixed(2),
      "-i",
      src,
      "-frames:v",
      "1",
      "-vf",
      `scale='min(${THUMB_MAX},iw)':-2`,
      "-q:v",
      "3",
      "-y",
      outJpg,
    ],
    TIMEOUT.video
  )
}

async function renderPdf(src: string, outJpg: string, tmpDir: string): Promise<boolean> {
  // pdftoppm names output `<prefix>-<page>.jpg`; we render only page 1.
  const prefix = path.join(tmpDir, "page")
  const ok = await run(
    "pdftoppm",
    ["-jpeg", "-f", "1", "-l", "1", "-scale-to", String(THUMB_MAX), src, prefix],
    TIMEOUT.pdf
  )
  if (!ok) return false
  const produced = fs
    .readdirSync(tmpDir)
    .find((f) => f.startsWith("page") && f.endsWith(".jpg"))
  if (!produced) return false
  fs.renameSync(path.join(tmpDir, produced), outJpg)
  return true
}

async function renderOffice(src: string, outJpg: string, tmpDir: string): Promise<boolean> {
  // Convert to PDF first, then reuse the PDF renderer for the first page. A
  // per-job UserInstallation profile lets concurrent libreoffice runs coexist.
  const profile = path.join(tmpDir, "lo-profile")
  const ok = await run(
    "libreoffice",
    [
      "--headless",
      "--norestore",
      "--nolockcheck",
      `-env:UserInstallation=file://${profile}`,
      "--convert-to",
      "pdf",
      "--outdir",
      tmpDir,
      src,
    ],
    TIMEOUT.office
  )
  if (!ok) return false
  const pdf = fs.readdirSync(tmpDir).find((f) => f.toLowerCase().endsWith(".pdf"))
  if (!pdf) return false
  return renderPdf(path.join(tmpDir, pdf), outJpg, tmpDir)
}

async function renderTo(
  kind: ThumbKind,
  src: string,
  outJpg: string,
  tmpDir: string
): Promise<boolean> {
  switch (kind) {
    case "image":
      return renderImage(src, outJpg)
    case "video":
      return renderVideo(src, outJpg)
    case "pdf":
      return renderPdf(src, outJpg, tmpDir)
    case "office":
      return renderOffice(src, outJpg, tmpDir)
  }
}

async function mark(fileId: string, key: string | null, state: string): Promise<void> {
  await prisma.file
    .update({ where: { id: fileId }, data: { thumbnailKey: key, thumbnailState: state } })
    .catch(() => {})
}

// In-flight registry: generating the same file from both the upload hook and a
// concurrent thumbnail request should run once and share the result.
const inflight = new Map<string, Promise<string | null>>()

// Generate (or return an existing) thumbnail for a file. Resolves the thumbnail
// storage key, or null if the file can't be / wasn't successfully thumbnailed.
export function generateThumbnail(fileId: string): Promise<string | null> {
  const existing = inflight.get(fileId)
  if (existing) return existing
  const p = doGenerate(fileId).finally(() => inflight.delete(fileId))
  inflight.set(fileId, p)
  return p
}

// Fire-and-forget variant for the upload path — failures are already recorded
// on the row, so there's nothing for the caller to handle.
export function queueThumbnail(fileId: string): void {
  generateThumbnail(fileId).catch(() => {})
}

async function doGenerate(fileId: string): Promise<string | null> {
  const file = (await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      name: true,
      mimeType: true,
      storageKey: true,
      thumbnailKey: true,
      thumbnailState: true,
    },
  })) as ThumbFile | null
  if (!file) return null

  // Already have a usable thumbnail on disk — reuse it.
  if (file.thumbnailKey && fs.existsSync(absolutePath(file.thumbnailKey)))
    return file.thumbnailKey

  const kind = thumbKind(file)
  if (!kind) {
    await mark(file.id, null, "unsupported")
    return null
  }

  const src = absolutePath(file.storageKey)
  if (!fs.existsSync(src)) return null

  return withSlot(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ddthumb-"))
    try {
      const outJpg = path.join(tmpDir, "thumb.jpg")
      const ok = await renderTo(kind, src, outJpg, tmpDir)
      if (!ok || !fs.existsSync(outJpg) || fs.statSync(outJpg).size === 0) {
        await mark(file.id, null, "failed")
        return null
      }
      const key = newStorageKey(`${file.id}.jpg`)
      fs.copyFileSync(outJpg, ensureDirFor(key))
      await mark(file.id, key, "ready")
      return key
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {}
    }
  })
}
