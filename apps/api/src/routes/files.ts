import { Router } from "express"
import { z } from "zod"
import fs from "node:fs"
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
import { getFileWithAccess, getFolderWithAccess } from "../lib/access.js"

export const filesRouter = Router()

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const tmp = path.join(STORAGE_ROOT, ".tmp")
      fs.mkdirSync(tmp, { recursive: true })
      cb(null, tmp)
    },
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.originalname}`),
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
})

filesRouter.use(requireAuth)

filesRouter.post("/upload", upload.array("files", 100), async (req, res) => {
  const user = currentUser(req)
  const folderId = z.string().parse(req.body.folderId)
  const folder = await getFolderWithAccess(user.id, folderId, "write")
  const files = (req.files as Express.Multer.File[]) ?? []
  if (!folder) {
    for (const f of files) fs.unlinkSync(f.path)
    return res.status(403).json({ error: "forbidden" })
  }

  // Quota check — against the owner of the target folder
  const incoming = files.reduce((n, f) => n + f.size, 0)
  const used = await prisma.file.aggregate({
    _sum: { size: true },
    where: { ownerId: folder.ownerId, isTrashed: false },
  })
  const owner = await prisma.user.findUnique({ where: { id: folder.ownerId } })
  const quota = owner?.storageQuotaBytes ?? BigInt(0)
  if (BigInt(used._sum.size ?? BigInt(0)) + BigInt(incoming) > quota) {
    for (const f of files) fs.unlinkSync(f.path)
    return res.status(413).json({ error: "quota_exceeded" })
  }

  const created = []
  for (const f of files) {
    const key = newStorageKey(f.originalname)
    const dest = ensureDirFor(key)
    fs.renameSync(f.path, dest)
    const rec = await prisma.file.create({
      data: {
        name: f.originalname,
        folderId: folder.id,
        ownerId: folder.ownerId,
        spaceId: folder.spaceId,
        size: BigInt(f.size),
        mimeType: f.mimetype || mime.lookup(f.originalname) || "application/octet-stream",
        storageKey: key,
      },
    })
    created.push({ ...rec, size: Number(rec.size) })
  }
  res.status(201).json({ files: created })
})

filesRouter.get("/:id/download", async (req, res) => {
  const user = currentUser(req)
  const file = await getFileWithAccess(user.id, req.params.id, "read")
  if (!file) return res.status(404).json({ error: "not_found" })
  const abs = absolutePath(file.storageKey)
  if (!fs.existsSync(abs)) return res.status(410).json({ error: "gone" })
  // log access for recents / suggestions
  prisma.fileAccess
    .create({
      data: {
        userId: user.id,
        fileId: file.id,
        action: req.query.inline === "1" ? "view" : "download",
      },
    })
    .catch(() => {})
  res.setHeader("Content-Type", file.mimeType)
  res.setHeader(
    "Content-Disposition",
    `${req.query.inline === "1" ? "inline" : "attachment"}; filename="${encodeURIComponent(file.name)}"`
  )
  fs.createReadStream(abs).pipe(res)
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
