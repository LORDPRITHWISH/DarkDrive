import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { Prisma, type User } from "@prisma/client"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { assertUserPhotosRootId } from "../lib/access.js"
import { logActivity } from "../lib/activity.js"

// DarkGallery's backend. Deliberately thin: a gallery item is an ordinary
// File owned by the user, sitting in their "My Photos" root instead of "My
// Drive" — so quota, trash, sharing, thumbnails, versions and search all keep
// working with no gallery-specific machinery. What lives here is only the
// three things the drive endpoints can't already express: a capture-date
// timeline, albums, and the backup dedupe check.
//
// Uploads go through /api/files/upload/* with folderId = the photos root, and
// per-item edits (star, rename, trash, move) through PATCH /api/files/:id.
//
// The photos root hangs off no parent, so it is outside the drive tree the
// sync clients walk (see routes/sync.ts's pathOf returning null) — pairing a
// laptop does not drag the phone's camera roll onto its disk.
export const galleryRouter = Router()
galleryRouter.use(requireAuth)

// One screen of a fast scroll on a large display, roughly.
const DEFAULT_LIMIT = 120
const MAX_LIMIT = 500

// An album is a Folder parented to the photos root; membership is a
// FileShortcut into it, exactly like a file surfaced inside a space. Photos
// therefore live in one place and appear in any number of albums, and album
// sharing is just the existing folder share.
type AlbumFolder = { id: string; name: string; createdAt: Date }

function itemView<T extends { size: bigint; takenAt: Date | null; createdAt: Date }>(f: T) {
  // `at` is what the client sorts and groups by, so the fallback to upload
  // time lives here rather than in three different clients.
  return { ...f, size: Number(f.size), at: f.takenAt ?? f.createdAt }
}

const ITEM_FIELDS = {
  id: true,
  name: true,
  size: true,
  mimeType: true,
  takenAt: true,
  createdAt: true,
  isStarred: true,
  isTrashed: true,
  thumbnailState: true,
  sha256: true,
} satisfies Prisma.FileSelect

// The library, newest capture first.
//
// ponytail: offset paging. A photo uploaded mid-scroll can shift a page
// boundary and repeat one item; switch to keyset on (takenAt, id) if a library
// ever gets big enough for that to be noticeable.
galleryRouter.get("/timeline", async (req, res) => {
  const user = currentUser(req)
  const q = z
    .object({
      filter: z.enum(["all", "favorites", "trash"]).default("all"),
      offset: z.coerce.number().int().nonnegative().default(0),
      limit: z.coerce.number().int().positive().max(MAX_LIMIT).default(DEFAULT_LIMIT),
    })
    .parse(req.query)

  const photosRootId = await assertUserPhotosRootId(user)
  const where: Prisma.FileWhereInput = {
    ownerId: user.id,
    folderId: photosRootId,
    isHidden: false,
    // Items an admin has hard-deleted are retained for the recycle bin but
    // must not surface anywhere a user can see.
    deletedAt: null,
    ...(q.filter === "trash"
      ? { isTrashed: true }
      : { isTrashed: false, ...(q.filter === "favorites" ? { isStarred: true } : {}) }),
  }

  const items = await prisma.file.findMany({
    where,
    select: ITEM_FIELDS,
    // Files moved in from the drive have no capture date; they sort after
    // everything that does, by upload time.
    orderBy: [{ takenAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    skip: q.offset,
    take: q.limit,
  })

  res.json({
    photosRootId,
    items: items.map(itemView),
    nextOffset: items.length === q.limit ? q.offset + q.limit : null,
  })
})

// Which of these are already backed up. The mobile app hashes each camera-roll
// asset and asks before uploading, so a re-install (or a second device holding
// the same photos) re-uploads nothing.
galleryRouter.post("/have", async (req, res) => {
  const user = currentUser(req)
  const { sha256 } = z
    .object({ sha256: z.array(z.string().length(64)).max(1000) })
    .parse(req.body)
  if (!sha256.length) return res.json({ have: [] })

  const rows = await prisma.file.findMany({
    where: { ownerId: user.id, isTrashed: false, sha256: { in: sha256 } },
    select: { sha256: true },
    distinct: ["sha256"],
  })
  res.json({ have: rows.map((r) => r.sha256).filter(Boolean) })
})

// --- albums ----------------------------------------------------------------

// ponytail: counts and covers are rolled up in JS over one shortcut query
// rather than per-album aggregates — personal-library scale. Group in SQL if
// an account ever holds enough albums to feel it.
galleryRouter.get("/albums", async (req, res) => {
  const user = currentUser(req)
  const photosRootId = await assertUserPhotosRootId(user)
  const albums: AlbumFolder[] = await prisma.folder.findMany({
    where: { ownerId: user.id, parentId: photosRootId, isTrashed: false },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })
  if (!albums.length) return res.json({ albums: [] })

  const links = await prisma.fileShortcut.findMany({
    where: {
      folderId: { in: albums.map((a) => a.id) },
      file: { isTrashed: false, deletedAt: null },
    },
    select: { folderId: true, file: { select: ITEM_FIELDS } },
  })

  const byAlbum = new Map<string, (typeof links)[number]["file"][]>()
  for (const l of links) {
    const list = byAlbum.get(l.folderId)
    if (list) list.push(l.file)
    else byAlbum.set(l.folderId, [l.file])
  }

  res.json({
    albums: albums.map((a) => {
      const items = byAlbum.get(a.id) ?? []
      // Cover = the newest photo in the album, same as the timeline's order.
      const cover = items.reduce<(typeof items)[number] | null>(
        (best, f) =>
          !best || (f.takenAt ?? f.createdAt) > (best.takenAt ?? best.createdAt) ? f : best,
        null
      )
      return { ...a, count: items.length, cover: cover ? itemView(cover) : null }
    }),
  })
})

galleryRouter.post("/albums", async (req, res) => {
  const user = currentUser(req)
  const { name, fileIds } = z
    .object({
      name: z.string().trim().min(1).max(255),
      fileIds: z.array(z.string()).max(MAX_LIMIT).optional(),
    })
    .parse(req.body)

  const photosRootId = await assertUserPhotosRootId(user)
  const album = await prisma.folder.create({
    data: { name, ownerId: user.id, parentId: photosRootId },
  })
  const added = fileIds?.length ? await linkToAlbum(user.id, album.id, fileIds) : 0
  await logActivity({ userId: user.id, folderId: album.id, action: "create" })
  res.status(201).json({ album: { ...album, count: added } })
})

galleryRouter.get("/albums/:id", async (req, res) => {
  const user = currentUser(req)
  const album = await getAlbum(user, req.params.id)
  if (!album) return res.status(404).json({ error: "not_found" })

  const links = await prisma.fileShortcut.findMany({
    where: { folderId: album.id, file: { isTrashed: false, deletedAt: null } },
    select: { file: { select: ITEM_FIELDS } },
  })
  const items = links
    .map((l) => itemView(l.file))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
  res.json({ album, items })
})

galleryRouter.patch("/albums/:id", async (req, res) => {
  const user = currentUser(req)
  const { name } = z.object({ name: z.string().trim().min(1).max(255) }).parse(req.body)
  const album = await getAlbum(user, req.params.id)
  if (!album) return res.status(404).json({ error: "not_found" })

  const updated = await prisma.folder.update({ where: { id: album.id }, data: { name } })
  await logActivity({
    userId: user.id,
    folderId: album.id,
    action: "rename",
    detail: { from: album.name, to: name },
  })
  res.json({ album: updated })
})

// Trashes the album itself. The photos in it are untouched — they live in the
// photos root, not in the album.
galleryRouter.delete("/albums/:id", async (req, res) => {
  const user = currentUser(req)
  const album = await getAlbum(user, req.params.id)
  if (!album) return res.status(404).json({ error: "not_found" })

  await prisma.folder.update({ where: { id: album.id }, data: { isTrashed: true } })
  await logActivity({ userId: user.id, folderId: album.id, action: "trash" })
  res.json({ ok: true })
})

galleryRouter.post("/albums/:id/items", async (req, res) => {
  const user = currentUser(req)
  const { fileIds } = z
    .object({ fileIds: z.array(z.string()).min(1).max(MAX_LIMIT) })
    .parse(req.body)
  const album = await getAlbum(user, req.params.id)
  if (!album) return res.status(404).json({ error: "not_found" })
  res.json({ added: await linkToAlbum(user.id, album.id, fileIds) })
})

galleryRouter.delete("/albums/:id/items", async (req, res) => {
  const user = currentUser(req)
  const { fileIds } = z
    .object({ fileIds: z.array(z.string()).min(1).max(MAX_LIMIT) })
    .parse(req.body)
  const album = await getAlbum(user, req.params.id)
  if (!album) return res.status(404).json({ error: "not_found" })

  const { count } = await prisma.fileShortcut.deleteMany({
    where: { folderId: album.id, fileId: { in: fileIds } },
  })
  res.json({ removed: count })
})

// --- bulk item edits --------------------------------------------------------

// Selecting fifty photos and hitting favorite/delete is the normal case in a
// gallery, and PATCH /api/files/:id is one-at-a-time. Same effect, one query.
galleryRouter.patch("/items", async (req, res) => {
  const user = currentUser(req)
  const body = z
    .object({
      ids: z.array(z.string()).min(1).max(MAX_LIMIT),
      isStarred: z.boolean().optional(),
      isTrashed: z.boolean().optional(),
    })
    .parse(req.body)
  const { ids, ...data } = body
  if (!Object.keys(data).length) return res.status(400).json({ error: "nothing_to_update" })

  // Scoped to the caller's own files — ids are client-supplied, and a bulk
  // updateMany has no per-row access check to fall back on.
  const { count } = await prisma.file.updateMany({
    where: { id: { in: ids }, ownerId: user.id, deletedAt: null },
    data,
  })
  res.json({ updated: count })
})

// --- helpers ---------------------------------------------------------------

// An album is only an album if it is a live folder directly under this user's
// photos root — which also stops an arbitrary drive folder id being edited
// through these endpoints.
async function getAlbum(user: User, id: string) {
  const photosRootId = await assertUserPhotosRootId(user)
  return prisma.folder.findFirst({
    where: { id, ownerId: user.id, parentId: photosRootId, isTrashed: false },
  })
}

// Adds files to an album, ignoring ones already in it. Only files the caller
// owns can be linked; a shortcut grants read access, so an unchecked id here
// would be a way to read someone else's file.
async function linkToAlbum(userId: string, albumId: string, fileIds: string[]): Promise<number> {
  const owned = await prisma.file.findMany({
    where: { id: { in: fileIds }, ownerId: userId, isTrashed: false, deletedAt: null },
    select: { id: true },
  })
  if (!owned.length) return 0
  const { count } = await prisma.fileShortcut.createMany({
    data: owned.map((f) => ({ fileId: f.id, folderId: albumId })),
    skipDuplicates: true,
  })
  return count
}
