import { Router } from "express"
import { z } from "zod"
import fs from "node:fs"
import crypto from "node:crypto"
import multer from "multer"
import path from "node:path"
import mime from "mime-types"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { env } from "../env.js"
import {
  absolutePath,
  ensureDirFor,
  newStorageKey,
  removeFile,
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
  const file = await getFileWithAccess(user.id, req.params.id, "read")
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
  const file = await getFileWithAccess(user.id, req.params.id, "read")
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
  streamStoredFile(req, res, file, {
    disposition: req.query.inline === "1" ? "inline" : "attachment",
  })
})

// List sidecar subtitle tracks for a video: sibling files in the same folder
// whose base name matches the video (e.g. Movie.mkv ↔ Movie.en.srt).
filesRouter.get("/:id/subtitles", async (req, res) => {
  const user = currentUser(req)
  const file = await getFileWithAccess(user.id, req.params.id, "read")
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
  const file = await getFileWithAccess(user.id, req.params.id, "read")
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

filesRouter.patch("/:id", async (req, res) => {
  const user = currentUser(req)
  const body = z
    .object({
      name: z.string().min(1).max(255).optional(),
      folderId: z.string().optional(),
      isHidden: z.boolean().optional(),
      isStarred: z.boolean().optional(),
      isTrashed: z.boolean().optional(),
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

filesRouter.delete("/:id", async (req, res) => {
  const user = currentUser(req)
  const file = await getFileWithAccess(user.id, req.params.id, "admin")
  if (!file) return res.status(403).json({ error: "forbidden" })
  await prisma.file.delete({ where: { id: file.id } })
  try {
    removeFile(file.storageKey)
  } catch {}
  res.json({ ok: true })
})
