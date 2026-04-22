import { Router } from "express"
import { z } from "zod"
import fs from "node:fs"
import bcrypt from "bcryptjs"
import { nanoid } from "nanoid"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { getFileWithAccess, getFolderWithAccess } from "../lib/access.js"
import { absolutePath } from "../storage/local.js"
import { allowFrameEmbedding } from "../lib/embed.js"

export const sharesRouter = Router()

// Create a share link (authenticated)
sharesRouter.post("/", requireAuth, async (req, res) => {
  const user = currentUser(req)
  const body = z
    .object({
      resourceType: z.enum(["FILE", "FOLDER"]),
      resourceId: z.string(),
      permission: z.enum(["VIEW", "EDIT"]).default("VIEW"),
      expiresAt: z.string().datetime().optional(),
      password: z.string().min(4).optional(),
    })
    .parse(req.body)

  if (body.resourceType === "FILE") {
    const f = await getFileWithAccess(user.id, body.resourceId, "admin")
    if (!f) return res.status(403).json({ error: "forbidden" })
  } else {
    const f = await getFolderWithAccess(user.id, body.resourceId, "admin")
    if (!f) return res.status(403).json({ error: "forbidden" })
  }
  const share = await prisma.share.create({
    data: {
      token: nanoid(20),
      resourceType: body.resourceType,
      permission: body.permission,
      fileId: body.resourceType === "FILE" ? body.resourceId : null,
      folderId: body.resourceType === "FOLDER" ? body.resourceId : null,
      createdById: user.id,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      passwordHash: body.password ? await bcrypt.hash(body.password, 10) : null,
    },
  })
  res.status(201).json({ token: share.token, id: share.id })
})

// List shares for a resource
sharesRouter.get("/for/:type/:id", requireAuth, async (req, res) => {
  const user = currentUser(req)
  const type = req.params.type.toUpperCase() as "FILE" | "FOLDER"
  const list = await prisma.share.findMany({
    where: {
      createdById: user.id,
      resourceType: type,
      ...(type === "FILE" ? { fileId: req.params.id } : { folderId: req.params.id }),
    },
  })
  res.json({ shares: list })
})

sharesRouter.delete("/:id", requireAuth, async (req, res) => {
  const user = currentUser(req)
  const s = await prisma.share.findUnique({ where: { id: req.params.id } })
  if (!s || s.createdById !== user.id) return res.status(403).json({ error: "forbidden" })
  await prisma.share.delete({ where: { id: s.id } })
  res.json({ ok: true })
})

// Public: resolve a share token
sharesRouter.post("/resolve/:token", async (req, res) => {
  const s = await prisma.share.findUnique({
    where: { token: req.params.token },
    include: { file: true, folder: true },
  })
  if (!s) return res.status(404).json({ error: "not_found" })
  if (s.expiresAt && s.expiresAt < new Date()) return res.status(410).json({ error: "expired" })

  if (s.passwordHash) {
    const password = z.string().optional().parse(req.body?.password)
    if (!password || !(await bcrypt.compare(password, s.passwordHash))) {
      return res.status(401).json({ error: "password_required" })
    }
  }

  if (s.resourceType === "FILE" && s.file) {
    res.json({
      type: "FILE",
      permission: s.permission,
      file: { ...s.file, size: Number(s.file.size) },
    })
  } else if (s.resourceType === "FOLDER" && s.folder) {
    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: { parentId: s.folder.id, isHidden: false, isTrashed: false },
        orderBy: { name: "asc" },
      }),
      prisma.file.findMany({
        where: { folderId: s.folder.id, isHidden: false, isTrashed: false },
        orderBy: { name: "asc" },
      }),
    ])
    res.json({
      type: "FOLDER",
      permission: s.permission,
      folder: s.folder,
      folders,
      files: files.map((f) => ({ ...f, size: Number(f.size) })),
    })
  } else {
    res.status(404).json({ error: "not_found" })
  }
})

// Public: download via share
sharesRouter.get("/:token/download/:fileId?", async (req, res) => {
  const s = await prisma.share.findUnique({
    where: { token: req.params.token },
    include: { file: true, folder: true },
  })
  if (!s) return res.status(404).json({ error: "not_found" })
  if (s.expiresAt && s.expiresAt < new Date()) return res.status(410).json({ error: "expired" })

  let fileId: string | undefined
  if (s.resourceType === "FILE" && s.file) fileId = s.file.id
  else if (s.resourceType === "FOLDER") fileId = req.params.fileId

  if (!fileId) return res.status(400).json({ error: "file_required" })

  const file = await prisma.file.findUnique({ where: { id: fileId } })
  if (!file) return res.status(404).json({ error: "not_found" })

  // if folder share, ensure file is a descendant
  if (s.resourceType === "FOLDER" && s.folderId) {
    if (!(await isFileUnderFolder(file.folderId, s.folderId)))
      return res.status(403).json({ error: "forbidden" })
  }

  const abs = absolutePath(file.storageKey)
  if (!fs.existsSync(abs)) return res.status(410).json({ error: "gone" })
  const inline = req.query.inline === "1"
  if (inline) allowFrameEmbedding(res)
  res.setHeader("Content-Type", file.mimeType)
  res.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.name)}"`
  )
  fs.createReadStream(abs).pipe(res)
})

async function isFileUnderFolder(startFolderId: string, rootFolderId: string): Promise<boolean> {
  let cur: string | null = startFolderId
  while (cur) {
    if (cur === rootFolderId) return true
    const p: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: cur },
      select: { parentId: true },
    })
    cur = p?.parentId ?? null
  }
  return false
}
