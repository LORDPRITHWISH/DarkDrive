import express, { Router } from "express"
import { z } from "zod"
import fs from "node:fs"
import crypto from "node:crypto"
import multer from "multer"
import path from "node:path"
import mime from "mime-types"
import { ZipArchive, type Archiver } from "archiver"
import unzipper from "unzipper"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { env } from "../env.js"
import {
  absolutePath,
  ensureDirFor,
  newStorageKey,
  STORAGE_ROOT,
} from "../storage/local.js"
import {
  assertUserRootFolderId,
  getFileWithAccess,
  getFolderWithAccess,
} from "../lib/access.js"
import { allowFrameEmbedding } from "../lib/embed.js"
import { streamStoredFile } from "../lib/stream.js"
import { listSubtitleSiblings, isSubtitleFile, toVtt } from "../lib/subtitles.js"
import {
  canThumbnail,
  generateThumbnail,
  queueThumbnail,
  canStoryboard,
  generateStoryboard,
  buildStoryboardVtt,
  type StoryboardMeta,
} from "../lib/thumbnails.js"
import { probeAudioStreams, getAudioVariant } from "../lib/audioTracks.js"
import { maybeNotifyQuotaNearLimit } from "../lib/notify.js"
import { importUrlToFile } from "../lib/urlImport.js"
import { getIO } from "../realtime/socket.js"

export const filesRouter = Router()

// Client-visible chunk size. Sits below typical reverse-proxy body limits
// while keeping round-trips low.
const CHUNK_SIZE = 25 * 1024 * 1024
// Hard cap on an individual chunk request body. Gives clients some slack if
// they pick a slightly larger chunk size, while still keeping each request
// below proxy limits.
const MAX_CHUNK_BYTES = 32 * 1024 * 1024
// Upload sessions past this age are cleaned up; clients must re-init.
const SESSION_TTL_MS = 60 * 60 * 1000

const UPLOADS_ROOT = path.join(STORAGE_ROOT, ".uploads")
fs.mkdirSync(UPLOADS_ROOT, { recursive: true })

type UploadSession = {
  userId: string
  folderId: string
  name: string
  size: number
  mimeType: string
  tmpDir: string
  chunks: Set<number>
  createdAt: number
}
// In-memory session registry. If the API restarts mid-upload the client must
// restart — acceptable trade-off for the simpler implementation, and matches
// the pre-chunking behavior (a single POST also fails on restart).
const sessions = new Map<string, UploadSession>()
// Caps concurrent URL imports per user so one user can't tie up unbounded
// outbound bandwidth/connections on the server.
const MAX_CONCURRENT_IMPORTS = 2
const importsInFlight = new Map<string, number>()
const PREVIEW_TTL_MS = 60 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL_MS) {
      try {
        fs.rmSync(s.tmpDir, { recursive: true, force: true })
      } catch {}
      sessions.delete(id)
    }
  }
}, 10 * 60 * 1000).unref()

const chunkUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const tmp = path.join(STORAGE_ROOT, ".tmp")
      fs.mkdirSync(tmp, { recursive: true })
      cb(null, tmp)
    },
    filename: (_req, _file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`),
  }),
  limits: { fileSize: MAX_CHUNK_BYTES },
})

function isOfficeFile(file: { mimeType: string; name: string }) {
  return (
    /\.(pptx?|docx?|xlsx?)$/i.test(file.name) ||
    file.mimeType.includes("officedocument") ||
    file.mimeType.includes("ms-powerpoint") ||
    file.mimeType === "application/msword" ||
    file.mimeType === "application/vnd.ms-excel"
  )
}

function isPdfFile(file: { mimeType: string; name: string }) {
  return file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name)
}

function isPreviewableFile(file: { mimeType: string; name: string }) {
  return isOfficeFile(file) || isPdfFile(file)
}

function previewSignature(
  file: { id: string; storageKey: string },
  expiresAt: number
) {
  return crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(`${file.id}:${file.storageKey}:${expiresAt}`)
    .digest("base64url")
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf)
}


filesRouter.get("/:id/preview", async (req, res) => {
  const sig = Array.isArray(req.query.sig) ? req.query.sig[0] : req.query.sig
  const expires = Array.isArray(req.query.expires)
    ? req.query.expires[0]
    : req.query.expires

  if (typeof sig === "string" || typeof expires === "string") {
    if (typeof sig !== "string" || typeof expires !== "string") {
      return res.status(400).json({ error: "invalid_preview_token" })
    }
    const expiresAt = Number(expires)
    if (!Number.isInteger(expiresAt) || expiresAt <= 0) {
      return res.status(400).json({ error: "invalid_preview_token" })
    }
    if (Date.now() > expiresAt) {
      return res.status(410).json({ error: "expired" })
    }

    const file = await prisma.file.findUnique({ where: { id: req.params.id } })
    if (!file) return res.status(404).json({ error: "not_found" })
    if (!isPreviewableFile(file)) {
      return res.status(415).json({ error: "unsupported_preview" })
    }
    if (!safeEqual(sig, previewSignature(file, expiresAt))) {
      return res.status(403).json({ error: "forbidden" })
    }

    return streamStoredFile(req, res, file, { disposition: "inline" })
  }

  if (!req.user) return res.status(401).json({ error: "unauthorized" })

  const user = currentUser(req)
  const file = await getFileWithAccess(user.id, req.params.id, "read", { role: user.role })
  if (!file) return res.status(404).json({ error: "not_found" })
  if (!isPreviewableFile(file)) {
    return res.status(415).json({ error: "unsupported_preview" })
  }

  prisma.fileAccess
    .create({
      data: {
        userId: user.id,
        fileId: file.id,
        action: "view",
      },
    })
    .catch(() => {})

  const expiresAt = Date.now() + PREVIEW_TTL_MS
  const sourceUrl = new URL(`/api/files/${file.id}/preview`, env.APP_URL)
  sourceUrl.searchParams.set("expires", String(expiresAt))
  sourceUrl.searchParams.set("sig", previewSignature(file, expiresAt))

  if (req.query.format === "json") {
    return res.json({
      sourceUrl: sourceUrl.toString(),
      expiresAt: new Date(expiresAt).toISOString(),
    })
  }

  allowFrameEmbedding(res)
  res.setHeader("Cache-Control", "no-store")
  res.redirect(sourceUrl.toString())
})

filesRouter.use(requireAuth)

// Start a chunked upload. Reserves quota and sets up a tmp dir for chunks.
filesRouter.post("/upload/init", async (req, res) => {
  const user = currentUser(req)
  const body = z
    .object({
      folderId: z.string(),
      name: z.string().min(1).max(255),
      size: z.number().int().nonnegative(),
      mimeType: z.string().max(255).optional(),
    })
    .parse(req.body)

  if (body.size > env.MAX_UPLOAD_MB * 1024 * 1024)
    return res.status(413).json({ error: "too_large" })

  const folder = await getFolderWithAccess(user.id, body.folderId, "write")
  if (!folder) return res.status(403).json({ error: "forbidden" })

  // Quota always charged to the uploader, even for shared-space uploads.
  const used = await prisma.file.aggregate({
    _sum: { size: true },
    where: { ownerId: user.id, isTrashed: false },
  })
  const quota = user.storageQuotaBytes ?? BigInt(0)
  if (BigInt(used._sum.size ?? BigInt(0)) + BigInt(body.size) > quota)
    return res.status(413).json({ error: "quota_exceeded" })

  const uploadId = crypto.randomBytes(16).toString("hex")
  const tmpDir = path.join(UPLOADS_ROOT, uploadId)
  fs.mkdirSync(tmpDir, { recursive: true })
  sessions.set(uploadId, {
    userId: user.id,
    folderId: body.folderId,
    name: body.name,
    size: body.size,
    mimeType:
      body.mimeType || mime.lookup(body.name) || "application/octet-stream",
    tmpDir,
    chunks: new Set(),
    createdAt: Date.now(),
  })
  res.status(201).json({ uploadId, chunkSize: CHUNK_SIZE })
})

// Upload a single chunk. Body is multipart with `chunkIndex` + `chunk` file.
filesRouter.post(
  "/upload/:uploadId/chunk",
  chunkUpload.single("chunk"),
  async (req, res) => {
    const user = currentUser(req)
    const s = sessions.get(req.params.uploadId)
    const cleanup = () => {
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path)
        } catch {}
      }
    }
    if (!s || s.userId !== user.id) {
      cleanup()
      return res.status(404).json({ error: "no_session" })
    }
    const chunkIndex = Number(req.body?.chunkIndex)
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      cleanup()
      return res.status(400).json({ error: "invalid_chunk_index" })
    }
    if (!req.file) return res.status(400).json({ error: "no_chunk" })

    const dest = path.join(s.tmpDir, String(chunkIndex))
    fs.renameSync(req.file.path, dest)
    s.chunks.add(chunkIndex)
    res.json({ ok: true, received: s.chunks.size })
  }
)

// Finalize: concatenate chunks in order, write the file, create the DB rows.
filesRouter.post("/upload/:uploadId/complete", async (req, res) => {
  const user = currentUser(req)
  const s = sessions.get(req.params.uploadId)
  if (!s || s.userId !== user.id)
    return res.status(404).json({ error: "no_session" })

  const { totalChunks } = z
    .object({ totalChunks: z.number().int().positive() })
    .parse(req.body)

  for (let i = 0; i < totalChunks; i++) {
    if (!s.chunks.has(i))
      return res.status(400).json({ error: "missing_chunk", index: i })
  }

  // Re-check access at completion — membership may have changed mid-upload.
  const folder = await getFolderWithAccess(user.id, s.folderId, "write")
  if (!folder) {
    try {
      fs.rmSync(s.tmpDir, { recursive: true, force: true })
    } catch {}
    sessions.delete(req.params.uploadId)
    return res.status(403).json({ error: "forbidden" })
  }

  const key = newStorageKey(s.name)
  const dest = ensureDirFor(key)
  const out = fs.createWriteStream(dest)
  try {
    for (let i = 0; i < totalChunks; i++) {
      const src = path.join(s.tmpDir, String(i))
      await new Promise<void>((resolve, reject) => {
        const rd = fs.createReadStream(src)
        rd.on("error", reject)
        rd.on("end", () => resolve())
        rd.pipe(out, { end: false })
      })
    }
    await new Promise<void>((resolve, reject) => {
      out.on("error", reject)
      out.end(() => resolve())
    })
  } catch (err) {
    try {
      fs.unlinkSync(dest)
    } catch {}
    try {
      fs.rmSync(s.tmpDir, { recursive: true, force: true })
    } catch {}
    sessions.delete(req.params.uploadId)
    throw err
  }

  const stat = fs.statSync(dest)
  const abort = (status: number, error: string) => {
    try {
      fs.unlinkSync(dest)
    } catch {}
    try {
      fs.rmSync(s.tmpDir, { recursive: true, force: true })
    } catch {}
    sessions.delete(req.params.uploadId)
    return res.status(status).json({ error })
  }

  // Re-check quota at commit time (assembled size is authoritative).
  const used = await prisma.file.aggregate({
    _sum: { size: true },
    where: { ownerId: user.id, isTrashed: false },
  })
  const quota = user.storageQuotaBytes ?? BigInt(0)
  if (BigInt(used._sum.size ?? BigInt(0)) + BigInt(stat.size) > quota)
    return abort(413, "quota_exceeded")

  const intoSharedSpace = !!folder.spaceId
  const primaryFolderId = intoSharedSpace
    ? await assertUserRootFolderId(user)
    : folder.id
  const primarySpaceId = intoSharedSpace ? null : folder.spaceId

  const rec = await prisma.$transaction(async (tx) => {
    const file = await tx.file.create({
      data: {
        name: s.name,
        folderId: primaryFolderId,
        ownerId: user.id,
        spaceId: primarySpaceId,
        size: BigInt(stat.size),
        mimeType: s.mimeType,
        storageKey: key,
      },
    })
    if (intoSharedSpace) {
      await tx.fileShortcut.create({
        data: { fileId: file.id, folderId: folder.id },
      })
    }
    return file
  })

  try {
    fs.rmSync(s.tmpDir, { recursive: true, force: true })
  } catch {}
  sessions.delete(req.params.uploadId)

  // Kick off thumbnail generation in the background so the upload response
  // isn't blocked on ffmpeg/libreoffice. Missing thumbnails are also generated
  // lazily on first request, so this is just a head start.
  queueThumbnail(rec.id)

  void maybeNotifyQuotaNearLimit(user.id, BigInt(used._sum.size ?? BigInt(0)) + BigInt(stat.size), quota)

  res.status(201).json({ file: { ...rec, size: Number(rec.size) } })
})

// Abort / cleanup. Safe to call whether or not the session still exists.
filesRouter.delete("/upload/:uploadId", async (req, res) => {
  const user = currentUser(req)
  const s = sessions.get(req.params.uploadId)
  if (s && s.userId === user.id) {
    try {
      fs.rmSync(s.tmpDir, { recursive: true, force: true })
    } catch {}
    sessions.delete(req.params.uploadId)
  }
  res.json({ ok: true })
})

// Fetch a URL server-side and land it in the drive as a file — the "import
// from the web" counterpart to /upload. Mirrors the upload/complete flow
// below (quota check, File row, thumbnail kick-off) but sources bytes from
// an HTTP(S) response instead of assembled chunks.
filesRouter.post("/import-url", async (req, res) => {
  const user = currentUser(req)
  const body = z
    .object({
      folderId: z.string(),
      url: z.string().url(),
      name: z.string().min(1).max(255).optional(),
      // Echoed back on progress events so the client can match them to the
      // right upload-toaster entry — opaque to the server otherwise.
      clientId: z.string().max(100).optional(),
    })
    .parse(req.body)

  let parsedUrl: URL
  try {
    parsedUrl = new URL(body.url)
  } catch {
    return res.status(400).json({ error: "invalid_url" })
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
    return res.status(400).json({ error: "invalid_url" })

  const folder = await getFolderWithAccess(user.id, body.folderId, "write")
  if (!folder) return res.status(403).json({ error: "forbidden" })

  const inFlight = importsInFlight.get(user.id) ?? 0
  if (inFlight >= MAX_CONCURRENT_IMPORTS)
    return res.status(429).json({ error: "too_many_imports" })
  importsInFlight.set(user.id, inFlight + 1)

  try {
    const used = await prisma.file.aggregate({
      _sum: { size: true },
      where: { ownerId: user.id, isTrashed: false },
    })
    const quota = user.storageQuotaBytes ?? BigInt(0)
    const usedBytes = BigInt(used._sum.size ?? BigInt(0))
    const remaining = quota - usedBytes
    if (remaining <= BigInt(0)) return res.status(413).json({ error: "quota_exceeded" })
    const maxBytes = Math.min(env.MAX_UPLOAD_MB * 1024 * 1024, Number(remaining))

    // Signed CDN URLs (the common case here) tend to have one long opaque
    // token as their path, not a real filename — only trust it as a name if
    // it's short enough to plausibly be one; otherwise fall back later to
    // whatever Content-Disposition or the mime type gives us.
    let urlBasename: string | null = null
    try {
      const decoded = decodeURIComponent(path.basename(parsedUrl.pathname))
      urlBasename = decoded && decoded.length <= 100 ? decoded : null
    } catch {}
    const preliminaryName = (body.name?.trim() || urlBasename || "download").slice(0, 255)
    const key = newStorageKey(preliminaryName)
    const dest = ensureDirFor(key)

    let result: { size: number; mimeType: string | null; suggestedName: string | null }
    try {
      result = await importUrlToFile(body.url, dest, {
        maxBytes,
        onProgress: body.clientId
          ? (received, total, cdName) =>
              getIO()
                ?.to(`user:${user.id}`)
                .emit("import:progress", {
                  clientId: body.clientId,
                  received,
                  total,
                  // Best name known so far — Content-Disposition only shows
                  // up here (from response headers); the URL basename was
                  // already resolved above, before the request even went out.
                  name: body.name?.trim() || cdName?.trim() || urlBasename || undefined,
                })
          : undefined,
      })
    } catch (err: any) {
      try {
        fs.unlinkSync(dest)
      } catch {}
      const msg = err?.message ?? "import_failed"
      if (msg === "too_large") return res.status(413).json({ error: "too_large" })
      if (msg === "blocked_address") return res.status(400).json({ error: "url_not_allowed" })
      return res.status(502).json({ error: "fetch_failed" })
    }

    // Re-check quota with the authoritative downloaded size — mirrors the
    // race guard in upload/complete above.
    const used2 = await prisma.file.aggregate({
      _sum: { size: true },
      where: { ownerId: user.id, isTrashed: false },
    })
    const usedBytes2 = BigInt(used2._sum.size ?? BigInt(0))
    if (usedBytes2 + BigInt(result.size) > quota) {
      try {
        fs.unlinkSync(dest)
      } catch {}
      return res.status(413).json({ error: "quota_exceeded" })
    }

    const mimeType = result.mimeType || mime.lookup(preliminaryName) || "application/octet-stream"
    const name = (
      body.name?.trim() ||
      result.suggestedName?.trim() ||
      urlBasename ||
      (mime.extension(mimeType) ? `download.${mime.extension(mimeType)}` : "download")
    ).slice(0, 255)
    const intoSharedSpace = !!folder.spaceId
    const primaryFolderId = intoSharedSpace
      ? await assertUserRootFolderId(user)
      : folder.id
    const primarySpaceId = intoSharedSpace ? null : folder.spaceId

    const rec = await prisma.$transaction(async (tx) => {
      const file = await tx.file.create({
        data: {
          name,
          folderId: primaryFolderId,
          ownerId: user.id,
          spaceId: primarySpaceId,
          size: BigInt(result.size),
          mimeType,
          storageKey: key,
        },
      })
      if (intoSharedSpace) {
        await tx.fileShortcut.create({
          data: { fileId: file.id, folderId: folder.id },
        })
      }
      return file
    })

    queueThumbnail(rec.id)
    void maybeNotifyQuotaNearLimit(user.id, usedBytes2 + BigInt(result.size), quota)

    res.status(201).json({ file: { ...rec, size: Number(rec.size) } })
  } finally {
    const n = (importsInFlight.get(user.id) ?? 1) - 1
    if (n <= 0) importsInFlight.delete(user.id)
    else importsInFlight.set(user.id, n)
  }
})

// Create a shortcut of a file into another folder (e.g. add to space).
// Requires read access on the file and write access on the target folder.
filesRouter.post("/:id/shortcut", async (req, res) => {
  const user = currentUser(req)
  const { targetFolderId } = z
    .object({ targetFolderId: z.string() })
    .parse(req.body)
  const file = await getFileWithAccess(user.id, req.params.id, "read")
  if (!file) return res.status(404).json({ error: "not_found" })
  const target = await getFolderWithAccess(user.id, targetFolderId, "write")
  if (!target) return res.status(403).json({ error: "forbidden_target" })
  const sc = await prisma.fileShortcut.upsert({
    where: { fileId_folderId: { fileId: file.id, folderId: target.id } },
    update: {},
    create: { fileId: file.id, folderId: target.id },
  })
  res.status(201).json(sc)
})

// Remove a shortcut (unlink a file from a folder it was linked into).
// Requires write access on the folder containing the shortcut.
filesRouter.delete("/shortcuts/:id", async (req, res) => {
  const user = currentUser(req)
  const sc = await prisma.fileShortcut.findUnique({
    where: { id: req.params.id },
    include: { folder: true },
  })
  if (!sc) return res.status(404).json({ error: "not_found" })
  const folder = await getFolderWithAccess(user.id, sc.folderId, "write")
  if (!folder) return res.status(403).json({ error: "forbidden" })
  await prisma.fileShortcut.delete({ where: { id: sc.id } })
  res.json({ ok: true })
})

filesRouter.get("/:id/download", async (req, res) => {
  const user = currentUser(req)
  const file = await getFileWithAccess(user.id, req.params.id, "read", { role: user.role })
  if (!file) return res.status(404).json({ error: "not_found" })
  // log access for recents / suggestions — but only on the opening request.
  // Media seeking fires many ranged requests per playback; logging each one
  // would flood fileAccess, so we skip mid-stream range continuations.
  const range = req.headers.range
  const isContinuation = typeof range === "string" && !/^bytes=0?-/.test(range)
  if (!isContinuation) {
    prisma.fileAccess
      .create({
        data: {
          userId: user.id,
          fileId: file.id,
          action: req.query.inline === "1" ? "view" : "download",
        },
      })
      .catch(() => {})
  }
  // ?audio=<streamIndex> swaps in a cached remux with only that audio stream
  // — the reliable cross-browser way to pick an audio track, since browsers
  // don't consistently expose/switch embedded multi-audio streams themselves.
  // Falls back to the file's saved default (set once from the player/
  // properties panel) so it doesn't have to be reselected on every open.
  const audioParam = Array.isArray(req.query.audio)
    ? req.query.audio[0]
    : req.query.audio
  const streamIndex =
    typeof audioParam === "string" ? Number(audioParam) : file.audioTrackIndex ?? NaN
  if (Number.isInteger(streamIndex)) {
    const key = await getAudioVariant(file.id, absolutePath(file.storageKey), streamIndex)
    if (!key) return res.status(422).json({ error: "audio_track_unavailable" })
    return streamStoredFile(
      req,
      res,
      { name: file.name, mimeType: "video/mp4", storageKey: key },
      { disposition: req.query.inline === "1" ? "inline" : "attachment" }
    )
  }

  streamStoredFile(req, res, file, {
    disposition: req.query.inline === "1" ? "inline" : "attachment",
  })
})

// List embedded audio streams for a video (ffprobe). Returns every stream,
// including the single-track case — the client shows the track name and only
// enables switching when there's more than one to switch between.
filesRouter.get("/:id/audio-tracks", async (req, res) => {
  const user = currentUser(req)
  const file = await getFileWithAccess(user.id, req.params.id, "read", { role: user.role })
  if (!file) return res.status(404).json({ error: "not_found" })
  const abs = absolutePath(file.storageKey)
  if (!fs.existsSync(abs)) return res.json({ tracks: [] })
  res.json({ tracks: await probeAudioStreams(abs) })
})

// Serve a file's preview thumbnail (a small JPEG). Generated on demand the
// first time it's requested if the upload-time job hasn't produced it yet, so
// this transparently backfills thumbnails for files uploaded before the
// pipeline existed. Returns 404 when no thumbnail can be produced — the client
// falls back to a type icon.
// Bulk zip download: bundles selected files/folders (recursively, following
// folder shortcuts the same way the folder-contents listing does) into a
// single streamed .zip. POST + urlencoded body (not GET query) because a
// large selection's item list can exceed safe URL length; the client submits
// a hidden form so the browser handles it as a normal attachment download.
const ZipItemsSchema = z
  .array(z.object({ type: z.enum(["file", "folder"]), id: z.string() }))
  .min(1)
  .max(2000)

function uniqueEntryName(used: Map<string, number>, name: string): string {
  const count = used.get(name) ?? 0
  used.set(name, count + 1)
  if (count === 0) return name
  const ext = path.extname(name)
  const base = ext ? name.slice(0, -ext.length) : name
  return `${base} (${count})${ext}`
}

function appendFileEntry(
  archive: Archiver,
  file: { name: string; storageKey: string },
  entryPath: string
) {
  const abs = absolutePath(file.storageKey)
  if (!fs.existsSync(abs)) return
  archive.file(abs, { name: entryPath })
}

// Recursively mirrors a folder's contents into the archive under `prefix`.
// Empty folders get an explicit directory entry so they still show up.
async function appendFolderToArchive(
  archive: Archiver,
  folderId: string,
  prefix: string,
  downloadedFileIds: string[]
): Promise<void> {
  const [subfolders, realFiles, shortcuts] = await Promise.all([
    prisma.folder.findMany({
      where: { parentId: folderId, isTrashed: false },
      orderBy: { name: "asc" },
    }),
    prisma.file.findMany({
      where: { folderId, isTrashed: false },
      orderBy: { name: "asc" },
    }),
    prisma.fileShortcut.findMany({
      where: { folderId, file: { isTrashed: false } },
      include: { file: true },
    }),
  ])

  const files = [...realFiles, ...shortcuts.map((s) => s.file)]
  if (files.length === 0 && subfolders.length === 0) {
    archive.append(Buffer.alloc(0), { name: `${prefix}/` })
    return
  }

  const used = new Map<string, number>()
  for (const file of files) {
    const entryName = uniqueEntryName(used, file.name)
    appendFileEntry(archive, file, `${prefix}/${entryName}`)
    downloadedFileIds.push(file.id)
  }
  for (const sub of subfolders) {
    const entryName = uniqueEntryName(used, sub.name)
    await appendFolderToArchive(archive, sub.id, `${prefix}/${entryName}`, downloadedFileIds)
  }
}

filesRouter.post(
  "/zip",
  express.urlencoded({ extended: false, limit: "256kb" }),
  async (req, res) => {
    const user = currentUser(req)

    let parsedItems: unknown
    try {
      parsedItems = JSON.parse(String(req.body?.items ?? ""))
    } catch {
      return res.status(400).json({ error: "invalid_items" })
    }
    const result = ZipItemsSchema.safeParse(parsedItems)
    if (!result.success) return res.status(400).json({ error: "invalid_items" })
    const items = result.data

    // Tolerate partial access failures (an item trashed/unshared mid-flight)
    // rather than failing the whole batch — same spirit as the bulk star/move
    // actions on the client, which apply per-item.
    const resolved = (
      await Promise.all(
        items.map(async (it) => {
          if (it.type === "file") {
            const file = await getFileWithAccess(user.id, it.id, "read", { role: user.role })
            return file ? ({ type: "file" as const, file }) : null
          }
          const folder = await getFolderWithAccess(user.id, it.id, "read", { role: user.role })
          return folder ? ({ type: "folder" as const, folder }) : null
        })
      )
    ).filter((x): x is NonNullable<typeof x> => x !== null)

    if (resolved.length === 0) return res.status(404).json({ error: "not_found" })

    const rawName = typeof req.body?.name === "string" ? req.body.name : ""
    const zipName = (rawName.trim() || "Download").slice(0, 150)

    res.setHeader("Content-Type", "application/zip")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(zipName)}.zip"`
    )
    res.setHeader("Cache-Control", "no-store")

    const archive = new ZipArchive({ zlib: { level: 6 } })
    archive.on("warning", (err: Error) => console.warn("[zip] warning:", err))
    archive.on("error", (err: Error) => {
      console.error("[zip] error:", err)
      res.destroy(err)
    })
    res.on("close", () => archive.destroy())
    archive.pipe(res)

    const downloadedFileIds: string[] = []
    const rootUsed = new Map<string, number>()
    try {
      for (const item of resolved) {
        if (item.type === "file") {
          const entryName = uniqueEntryName(rootUsed, item.file.name)
          appendFileEntry(archive, item.file, entryName)
          downloadedFileIds.push(item.file.id)
        } else {
          const entryName = uniqueEntryName(rootUsed, item.folder.name)
          await appendFolderToArchive(archive, item.folder.id, entryName, downloadedFileIds)
        }
      }
    } catch (err) {
      console.error("[zip] failed building archive:", err)
      res.destroy()
      return
    }

    archive.finalize()

    if (downloadedFileIds.length > 0) {
      prisma.fileAccess
        .createMany({
          data: downloadedFileIds.map((fileId) => ({
            userId: user.id,
            fileId,
            action: "download",
          })),
        })
        .catch(() => {})
    }
  }
)

// Zip extraction: unpacks an uploaded .zip in place, mirroring its directory
// structure as real folders under the target folder. Caps entry count so an
// adversarial archive can't flood the DB/filesystem with millions of rows.
const MAX_ZIP_ENTRIES = 5000

function isZipFile(file: { mimeType: string; name: string }) {
  return (
    /\.zip$/i.test(file.name) ||
    file.mimeType === "application/zip" ||
    file.mimeType === "application/x-zip-compressed"
  )
}

// Splits a zip entry's internal path into safe segments, rejecting anything
// that would climb outside the extraction root ("zip slip").
function safeEntrySegments(entryPath: string): string[] | null {
  const parts = entryPath.split("/").filter((p) => p.length > 0 && p !== ".")
  if (parts.some((p) => p === "..")) return null
  return parts
}

const ExtractSchema = z.object({
  folderId: z.string(),
  // Echoed back on progress events so the client can match them to the right
  // upload-toaster entry — same convention as /import-url's clientId.
  clientId: z.string().max(100).optional(),
})

filesRouter.post("/:id/extract", async (req, res) => {
  const user = currentUser(req)
  const body = ExtractSchema.parse(req.body)
  const file = await getFileWithAccess(user.id, req.params.id, "read", { role: user.role })
  if (!file) return res.status(404).json({ error: "not_found" })
  if (!isZipFile(file)) return res.status(415).json({ error: "not_a_zip" })

  // Extracts into whatever folder the client currently has open, not the
  // zip's own storage-record folderId — the latter is the file's real home
  // even when it's only visible here via a shortcut (see getFileWithAccess).
  const folder = await getFolderWithAccess(user.id, body.folderId, "write")
  if (!folder) return res.status(403).json({ error: "forbidden" })

  const abs = absolutePath(file.storageKey)
  if (!fs.existsSync(abs)) return res.status(410).json({ error: "gone" })

  let zip: unzipper.CentralDirectory
  try {
    zip = await unzipper.Open.file(abs)
  } catch {
    return res.status(400).json({ error: "invalid_zip" })
  }
  if (zip.files.length > MAX_ZIP_ENTRIES)
    return res.status(413).json({ error: "too_many_entries" })

  const totalFiles = zip.files.reduce((n, e) => n + (e.type === "File" ? 1 : 0), 0)

  // ponytail: quota gate trusts the zip's declared uncompressedSize instead of
  // tracking bytes actually written — a crafted zip could under-report to
  // slip past this. Upgrade path: accumulate real written bytes in the loop
  // below and abort once they'd exceed quota.
  const totalDeclaredSize = zip.files.reduce(
    (sum, e) => sum + (e.type === "File" ? e.uncompressedSize : 0),
    0
  )
  const used = await prisma.file.aggregate({
    _sum: { size: true },
    where: { ownerId: user.id, isTrashed: false },
  })
  const quota = user.storageQuotaBytes ?? BigInt(0)
  if (BigInt(used._sum.size ?? BigInt(0)) + BigInt(totalDeclaredSize) > quota)
    return res.status(413).json({ error: "quota_exceeded" })

  const intoSharedSpace = !!folder.spaceId
  const uploaderRootFolderId = intoSharedSpace ? await assertUserRootFolderId(user) : null
  // Narrowed copies: TS can't carry the null-check on `folder` into the
  // nested resolveDir closure below.
  const treeOwnerId = folder.ownerId
  const treeSpaceId = folder.spaceId

  const baseName = file.name.replace(/\.zip$/i, "") || "Archive"
  const rootFolder = await prisma.folder.create({
    data: { name: baseName, parentId: folder.id, ownerId: treeOwnerId, spaceId: treeSpaceId },
  })

  // The physical folder tree mirrors the zip's directories and is owned the
  // same way a manually-created subfolder here would be (see POST /folders).
  // Files follow the upload convention instead: in a shared space they live
  // flat under the uploader's own root with a shortcut into the tree, so
  // quota is always charged to whoever triggered the extraction.
  const dirFolderIds = new Map<string, string>([["", rootFolder.id]])
  async function resolveDir(parts: string[]): Promise<string> {
    const key = parts.join("/")
    const cached = dirFolderIds.get(key)
    if (cached) return cached
    const parentId = await resolveDir(parts.slice(0, -1))
    const created = await prisma.folder.create({
      data: {
        name: parts[parts.length - 1],
        parentId,
        ownerId: treeOwnerId,
        spaceId: treeSpaceId,
      },
    })
    dirFolderIds.set(key, created.id)
    return created.id
  }

  let extracted = 0
  try {
    for (const entry of zip.files) {
      const parts = safeEntrySegments(entry.path)
      if (!parts || parts.length === 0) continue
      if (entry.type === "Directory") {
        await resolveDir(parts)
        continue
      }
      const treeFolderId = await resolveDir(parts.slice(0, -1))
      const name = parts[parts.length - 1]
      const key = newStorageKey(name)
      const dest = ensureDirFor(key)
      await new Promise<void>((resolve, reject) => {
        entry
          .stream()
          .pipe(fs.createWriteStream(dest))
          .on("finish", resolve)
          .on("error", reject)
      })
      const stat = fs.statSync(dest)
      const mimeType = mime.lookup(name) || "application/octet-stream"

      const created = await prisma.file.create({
        data: {
          name,
          folderId: intoSharedSpace ? uploaderRootFolderId! : treeFolderId,
          ownerId: user.id,
          spaceId: intoSharedSpace ? null : folder.spaceId,
          size: BigInt(stat.size),
          mimeType,
          storageKey: key,
        },
      })
      if (intoSharedSpace) {
        await prisma.fileShortcut.create({
          data: { fileId: created.id, folderId: treeFolderId },
        })
      }
      queueThumbnail(created.id)
      extracted++
      if (body.clientId) {
        getIO()
          ?.to(`user:${user.id}`)
          .emit("extract:progress", { clientId: body.clientId, extracted, total: totalFiles })
      }
    }
  } catch (err) {
    // Tolerate a partial extract (e.g. a corrupt entry mid-archive) — whatever
    // made it in already has real DB rows and files on disk, so leaving it in
    // place beats a complex multi-row/multi-file rollback.
    console.error("[extract] failed partway through:", err)
    return res.status(207).json({ error: "partial_extract", folder: rootFolder, extracted })
  }

  void maybeNotifyQuotaNearLimit(
    user.id,
    BigInt(used._sum.size ?? BigInt(0)) + BigInt(totalDeclaredSize),
    quota
  )

  res.status(201).json({ folder: rootFolder, extracted })
})

filesRouter.get("/:id/thumbnail", async (req, res) => {
  const user = currentUser(req)
  const file = await getFileWithAccess(user.id, req.params.id, "read", { role: user.role })
  if (!file) return res.status(404).json({ error: "not_found" })
  if (!canThumbnail(file)) return res.status(415).json({ error: "unsupported" })

  let key = file.thumbnailKey
  // Don't keep retrying files we've already determined can't be thumbnailed.
  if (!key && file.thumbnailState !== "failed" && file.thumbnailState !== "unsupported") {
    key = await generateThumbnail(file.id)
  }
  if (!key) return res.status(404).json({ error: "no_thumbnail" })

  const abs = absolutePath(key)
  if (!fs.existsSync(abs)) return res.status(404).json({ error: "gone" })

  res.setHeader("Content-Type", "image/jpeg")
  // Thumbnails are content-addressed by storage key, so a given URL is stable;
  // private since the file may live in a non-public space.
  res.setHeader("Cache-Control", "private, max-age=86400")
  fs.createReadStream(abs).pipe(res)
})

// Don't keep retrying files we've already determined can't be storyboarded
// (mirrors the thumbnail route below); a fresh attempt only happens once the
// cached key/meta is missing and the last attempt didn't already fail.
async function resolveStoryboard(file: {
  id: string
  storyboardKey: string | null
  storyboardState: string | null
  storyboardMeta: unknown
}): Promise<{ key: string; meta: StoryboardMeta } | null> {
  if (file.storyboardKey && file.storyboardMeta)
    return { key: file.storyboardKey, meta: file.storyboardMeta as StoryboardMeta }
  if (file.storyboardState === "failed" || file.storyboardState === "unsupported") return null
  return generateStoryboard(file.id)
}

// Serve the seek bar's scrubbing-preview sprite sheet — a grid of JPEG frames
// generated on demand (see lib/thumbnails' storyboard pipeline) the first time
// either this or storyboard.vtt is requested.
filesRouter.get("/:id/storyboard.jpg", async (req, res) => {
  const user = currentUser(req)
  const file = await getFileWithAccess(user.id, req.params.id, "read", { role: user.role })
  if (!file) return res.status(404).json({ error: "not_found" })
  if (!canStoryboard(file)) return res.status(415).json({ error: "unsupported" })

  const result = await resolveStoryboard(file)
  if (!result) return res.status(404).json({ error: "no_storyboard" })

  const abs = absolutePath(result.key)
  if (!fs.existsSync(abs)) return res.status(404).json({ error: "gone" })

  res.setHeader("Content-Type", "image/jpeg")
  res.setHeader("Cache-Control", "private, max-age=86400")
  fs.createReadStream(abs).pipe(res)
})

// Serve the storyboard as a WebVTT track (one cue per sprite tile) so it can
// be attached to the <video> as a `kind="metadata" label="thumbnails"` track.
filesRouter.get("/:id/storyboard.vtt", async (req, res) => {
  const user = currentUser(req)
  const file = await getFileWithAccess(user.id, req.params.id, "read", { role: user.role })
  if (!file) return res.status(404).json({ error: "not_found" })
  if (!canStoryboard(file)) return res.status(415).json({ error: "unsupported" })

  const result = await resolveStoryboard(file)
  if (!result) return res.status(404).json({ error: "no_storyboard" })

  allowFrameEmbedding(res)
  res.setHeader("Content-Type", "text/vtt; charset=utf-8")
  res.setHeader("Cache-Control", "private, max-age=86400")
  res.send(buildStoryboardVtt(result.meta, "storyboard.jpg"))
})

// List sidecar subtitle tracks for a video: sibling files in the same folder
// whose base name matches the video (e.g. Movie.mkv ↔ Movie.en.srt).
filesRouter.get("/:id/subtitles", async (req, res) => {
  const user = currentUser(req)
  const file = await getFileWithAccess(user.id, req.params.id, "read", { role: user.role })
  if (!file) return res.status(404).json({ error: "not_found" })

  const siblings = await prisma.file.findMany({
    where: { folderId: file.folderId, isTrashed: false, id: { not: file.id } },
    select: { id: true, name: true },
  })
  const tracks = listSubtitleSiblings(file.name, siblings).map((t) => ({
    id: t.id,
    label: t.label,
    lang: t.lang,
    src: `/api/files/${t.id}/subtitle.vtt`,
  }))
  res.json({ tracks })
})

// Serve a subtitle file as WebVTT (converting SRT on the fly) so it can be
// attached to a <video> via a <track> element. Browsers only render VTT.
filesRouter.get("/:id/subtitle.vtt", async (req, res) => {
  const user = currentUser(req)
  const file = await getFileWithAccess(user.id, req.params.id, "read", { role: user.role })
  if (!file) return res.status(404).json({ error: "not_found" })
  if (!isSubtitleFile(file.name)) {
    return res.status(415).json({ error: "unsupported_subtitle" })
  }
  const abs = absolutePath(file.storageKey)
  let raw: string
  try {
    raw = fs.readFileSync(abs, "utf8")
  } catch {
    return res.status(410).json({ error: "gone" })
  }
  allowFrameEmbedding(res)
  res.setHeader("Content-Type", "text/vtt; charset=utf-8")
  res.setHeader("Cache-Control", "no-store")
  res.send(toVtt(raw, file.name))
})

// File activity: view/download counts and a recent event log.
filesRouter.get("/:id/activity", async (req, res) => {
  const user = currentUser(req)
  const file = await getFileWithAccess(user.id, req.params.id, "read", { role: user.role })
  if (!file) return res.status(404).json({ error: "not_found" })

  const [views, downloads, recent] = await Promise.all([
    prisma.fileAccess.count({ where: { fileId: file.id, action: "view" } }),
    prisma.fileAccess.count({ where: { fileId: file.id, action: "download" } }),
    prisma.fileAccess.findMany({
      where: { fileId: file.id },
      orderBy: { accessedAt: "desc" },
      take: 30,
      select: {
        action: true,
        accessedAt: true,
        user: { select: { name: true, avatarUrl: true } },
      },
    }),
  ])

  res.json({
    stats: {
      views,
      downloads,
      lastAccessed: recent[0]?.accessedAt ?? null,
    },
    recent: recent.map((a) => ({
      action: a.action,
      accessedAt: a.accessedAt.toISOString(),
      user: { name: a.user.name, avatarUrl: a.user.avatarUrl ?? null },
    })),
  })
})

filesRouter.patch("/:id", async (req, res) => {
  const user = currentUser(req)
  const body = z
    .object({
      name: z.string().min(1).max(255).optional(),
      folderId: z.string().optional(),
      isHidden: z.boolean().optional(),
      isStarred: z.boolean().optional(),
      isTrashed: z.boolean().optional(),
      tags: z
        .array(z.string().trim().min(1).max(40))
        .max(30)
        .transform((arr) => Array.from(new Set(arr)))
        .optional(),
      audioTrackIndex: z.number().int().nullable().optional(),
      playbackPositionSec: z.number().min(0).nullable().optional(),
    })
    .parse(req.body)
  const file = await getFileWithAccess(user.id, req.params.id, "write")
  if (!file) return res.status(403).json({ error: "forbidden" })
  if (body.folderId) {
    const target = await getFolderWithAccess(user.id, body.folderId, "write")
    if (!target) return res.status(403).json({ error: "forbidden_target" })
  }
  const updated = await prisma.file.update({ where: { id: file.id }, data: body })
  res.json({ ...updated, size: Number(updated.size) })
})

// Reassign who a file is attributed to within a space (its uploader/owner).
// Restricted to the file's current owner or a system admin — the same
// authority that can already act on any user's data.
filesRouter.patch("/:id/owner", async (req, res) => {
  const user = currentUser(req)
  const { ownerId, spaceId } = z
    .object({ ownerId: z.string(), spaceId: z.string() })
    .parse(req.body)
  const file = await getFileWithAccess(user.id, req.params.id, "read", { role: user.role })
  if (!file) return res.status(403).json({ error: "forbidden" })
  if (file.ownerId !== user.id && user.role !== "ADMIN")
    return res.status(403).json({ error: "forbidden" })
  // New owner must belong to the space this file is being reassigned within.
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    include: { members: true },
  })
  const allowed =
    space && (space.ownerId === ownerId || space.members.some((m) => m.userId === ownerId))
  if (!allowed) return res.status(400).json({ error: "invalid_owner" })
  const updated = await prisma.file.update({ where: { id: file.id }, data: { ownerId } })
  res.json({ ...updated, size: Number(updated.size) })
})

// "Permanent" delete from the user's point of view: the file leaves their bin
// and every normal listing. It is NOT destroyed — it is soft-deleted into the
// admin-only recycle bin (stamped with deletedAt) so an admin can still restore
// or purge it. The blob on disk is retained until an admin purges. Keeping
// isTrashed=true preserves the invariant that deleted items never surface in
// any isTrashed:false query.
filesRouter.delete("/:id", async (req, res) => {
  const user = currentUser(req)
  const file = await getFileWithAccess(user.id, req.params.id, "admin")
  if (!file) return res.status(403).json({ error: "forbidden" })
  await prisma.file.update({
    where: { id: file.id },
    data: { deletedAt: new Date(), deletedById: user.id, isTrashed: true },
  })
  res.json({ ok: true })
})
