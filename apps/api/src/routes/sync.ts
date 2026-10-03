import crypto from "node:crypto"
import { Router, type NextFunction, type Request, type Response } from "express"
import type { User } from "@prisma/client"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { currentUser, denyTempSession, requireAuth } from "../middleware/auth.js"
import { assertUserRootFolderId, assertUserSyncRootId } from "../lib/access.js"
import { notify } from "../lib/notify.js"
import { env } from "../env.js"

export const syncRouter = Router()
syncRouter.use(requireAuth)

// Guard against a parent cycle wedging the path walk. Nothing should create
// one (folders.ts rejects moves into a descendant), but an unbounded while
// loop on user-shaped data is not worth the risk.
const MAX_DEPTH = 64

type FolderRow = {
  id: string; name: string; parentId: string | null
  isTrashed: boolean; deletedAt: Date | null; updatedAt: Date
}

// Path of a folder relative to the drive root, POSIX-separated. "" is the
// root itself; null means the folder hangs off something outside this drive
// (a space, or a broken parent chain) and should be skipped.
function pathBuilder(byId: Map<string, FolderRow>, rootId: string) {
  const cache = new Map<string, string | null>([[rootId, ""]])
  return function pathOf(id: string): string | null {
    const seen: string[] = []
    let cur: string | null = id
    let out: string | null = null
    for (let i = 0; i < MAX_DEPTH; i++) {
      if (cur === null) break
      const hit = cache.get(cur)
      if (hit !== undefined) {
        out = hit
        break
      }
      const row = byId.get(cur)
      if (!row) break
      seen.push(cur)
      cur = row.parentId
    }
    // Unwind, filling the cache on the way back down.
    for (const ancestor of seen.reverse()) {
      if (out === null) break
      const row = byId.get(ancestor)!
      out = out === "" ? row.name : `${out}/${row.name}`
      cache.set(ancestor, out)
    }
    for (const ancestor of seen) if (!cache.has(ancestor)) cache.set(ancestor, null)
    return out
  }
}

// Every folder outside spaces in the drive `root` is in: the user's own, or
// its owner's when `root` is a synced folder shared with the user
// (FolderMember). pathOf resolves paths within My Drive, syncedPathOf within
// "Synced Folders"; both return null for anything under another root (e.g.
// the photos root).
async function loadDrive(user: User, root: unknown) {
  const shared =
    typeof root === "string" && root !== ""
      ? await prisma.folderMember.findUnique({
          where: { folderId_userId: { folderId: root, userId: user.id } },
          select: { canUpload: true, canDelete: true, folder: { select: { ownerId: true } } },
        })
      : null
  const ownerId = shared?.folder.ownerId ?? user.id
  // What the user may do in it, which a sync client has to know beforehand:
  // refusing a change it already made on disk would only fail it every pass.
  const can = { upload: shared?.canUpload ?? "YES", delete: shared?.canDelete ?? "YES" }
  const [driveRoot, syncedRoot] = await Promise.all([assertUserRootFolderId(user), assertUserSyncRootId(user)])
  const folders: FolderRow[] = await prisma.folder.findMany({
    where: { ownerId, spaceId: null },
    select: { id: true, name: true, parentId: true, isTrashed: true, deletedAt: true, updatedAt: true },
  })
  const byId = new Map(folders.map((f) => [f.id, f]))
  return {
    ownerId, can, shared: shared !== null, driveRoot, syncedRoot, folders, byId,
    pathOf: pathBuilder(byId, driveRoot),
    syncedPathOf: pathBuilder(byId, syncedRoot),
  }
}

// The folder a client syncs against: `root` if it names a live folder in the
// user's drive or in Synced Folders, or a synced folder shared with them (the
// desktop app), the whole drive if it's absent (the mobile app). Anything
// else (someone else's folder, a space, the photos root, the bin) is refused
// outright, not quietly widened to the whole drive, which would pour every
// file onto a disk that asked for one folder.
function syncRoot(drive: Awaited<ReturnType<typeof loadDrive>>, raw: unknown): string | null {
  if (raw === undefined || raw === "") return drive.driveRoot
  const f = typeof raw === "string" ? drive.byId.get(raw) : undefined
  if (!f || f.isTrashed || f.deletedAt) return null
  if (!drive.shared && drive.pathOf(f.id) === null && drive.syncedPathOf(f.id) === null) return null
  return f.id
}

// A sync client asks for /changes every few seconds per folder it keeps, for
// as long as it runs, and each answer walks the account's whole folder tree
// (all of its files too, at since=0). Left open, that is the cheapest way
// there is to make this server work. So each account gets a budget: a daemon
// polls twice in a window, which leaves room for 30 of them, folders times
// computers. Past it the answer is 429 and when to come back, which the
// daemon waits out (apps/sync) and only shows as slower sync.
// ponytail: counted per process, one entry per account that has ever polled.
// Count in Redis like routes/tempSessions.ts if the API ever runs clustered.
const POLL_WINDOW_MS = 10_000
const POLLS_PER_WINDOW = 60
const polls = new Map<string, { window: number; n: number }>()
function pollLimit(req: Request, res: Response, next: NextFunction) {
  const id = currentUser(req).id
  const window = Math.floor(Date.now() / POLL_WINDOW_MS)
  const last = polls.get(id)
  const n = last?.window === window ? last.n + 1 : 1
  polls.set(id, { window, n })
  if (n <= POLLS_PER_WINDOW) return next()
  res.set("Retry-After", String(Math.ceil((POLL_WINDOW_MS - (Date.now() % POLL_WINDOW_MS)) / 1000)))
  res.status(429).json({ error: "too_many_polls" })
}

// What `gone` below names things by. A client can match one against an id it
// holds, and learns nothing of the ones it doesn't: in a shared folder those
// are its owner's, anywhere else in their drive.
const idTag = (id: string) => crypto.createHash("sha256").update(id).digest("hex")

// Everything in the user's own drive that changed since `since`, as paths.
// Deletes are included (isTrashed/deletedAt) so clients know to remove the
// local copy — no separate change journal is needed because every mutation
// already bumps updatedAt.
//
// A folder that is renamed, moved, binned or restored does NOT bump its
// descendants' updatedAt, though it takes them all along. So a changed folder
// is reported with everything under it: in the bin with it (deleted), or there
// to fetch if it was just moved in or put back. Where it only moved, a client
// that moves its directory first finds the rest already in place.
//
// ?root=<folderId> scopes it to one folder: paths are relative to it. What
// changed outside it has no path to report, and may be something that was
// moved out, which nothing on the row can tell. Those are `gone`: a client
// drops the ones it holds, like a delete.
//
// `can` is what the user may do in that folder ("YES" | "ASK" | "NO" each to
// adding and changing, and to binning): all YES in one of their own, a
// member's settings in a shared one (FolderMember).
syncRouter.get("/changes", pollLimit, async (req, res) => {
  const user = currentUser(req)
  const since = new Date(String(req.query.since ?? 0))
  if (Number.isNaN(since.getTime())) return res.status(400).json({ error: "bad_since" })

  // Captured before the reads: a row written mid-query is then re-delivered
  // next poll rather than missed. Applying a change twice is a no-op.
  const cursor = new Date()
  // Every folder, not just changed ones — needed to resolve parent chains.
  const drive = await loadDrive(user, req.query.root)
  const rootId = syncRoot(drive, req.query.root)
  if (!rootId) return res.status(404).json({ error: "sync_root_gone" })
  const { folders } = drive
  // Rooted at the sync folder, so anything outside it resolves to null and
  // is skipped below.
  const pathOf = pathBuilder(drive.byId, rootId)

  // A first sync holds nothing that could have left, and gets every file anyway.
  const first = since.getTime() === 0

  // The changed folders under the root, and all that's under each of them.
  const gone: string[] = []
  const touched = new Set<string>()
  const queue: string[] = []
  for (const f of folders) {
    if (f.updatedAt <= since || f.id === rootId) continue
    if (pathOf(f.id) === null) gone.push(idTag(f.id))
    else queue.push(f.id)
  }
  // Most polls find no folder changed, and skip the walk down.
  if (queue.length) {
    const kids = new Map<string, string[]>()
    for (const f of folders) {
      if (!f.parentId) continue
      const list = kids.get(f.parentId)
      if (list) list.push(f.id)
      else kids.set(f.parentId, [f.id])
    }
    for (const id of queue) {
      if (touched.has(id)) continue
      touched.add(id)
      queue.push(...(kids.get(id) ?? []))
    }
  }

  // In the bin, or in a folder that is. Only for a folder under the root, so
  // the walk up always ends there.
  const binnedMemo = new Map<string, boolean>([[rootId, false]])
  const binned = (id: string): boolean => {
    let hit = binnedMemo.get(id)
    if (hit === undefined) {
      const f = drive.byId.get(id)!
      hit = f.isTrashed || f.deletedAt !== null || binned(f.parentId!)
      binnedMemo.set(id, hit)
    }
    return hit
  }

  // By whose folder a file is in, not whose file it is: in a shared folder
  // each file belongs to whoever added it.
  // ponytail: one IN list of every touched folder. Fine into the thousands;
  // page it if someone moves a tree of tens of thousands of folders at once.
  const files = await prisma.file.findMany({
    where: {
      folder: { ownerId: drive.ownerId },
      spaceId: null,
      OR: [{ updatedAt: { gt: since } }, { folderId: { in: first ? [] : [...touched] } }],
    },
    select: {
      id: true, name: true, folderId: true, size: true, sha256: true,
      mimeType: true, isTrashed: true, deletedAt: true, updatedAt: true,
      ownerId: true, pending: true,
    },
  })

  const changedFolders = []
  for (const id of touched) {
    // Null only past MAX_DEPTH, which is skipped like before.
    const p = pathOf(id)
    if (p) changedFolders.push({ id, path: p, deleted: binned(id) })
  }

  const changedFiles = []
  for (const f of files) {
    const dir = pathOf(f.folderId)
    if (dir === null) {
      gone.push(idTag(f.id))
      continue
    }
    // Added by a member who has to ask, and not yet agreed to: theirs alone.
    // The owner's yes clears it, and that change is what delivers it here.
    if (f.pending === "upload" && f.ownerId !== user.id) continue
    changedFiles.push({
      id: f.id,
      path: dir === "" ? f.name : `${dir}/${f.name}`,
      size: Number(f.size),
      sha256: f.sha256,
      mimeType: f.mimeType,
      updatedAt: f.updatedAt,
      deleted: f.isTrashed || f.deletedAt !== null || binned(f.folderId),
    })
  }

  // Shallowest first so a client can mkdir parents before children.
  changedFolders.sort((a, b) => a.path.split("/").length - b.path.split("/").length)
  // Binned ones first: the name one left may be another file's by now, and a
  // client that goes by path has to be done with the old before it takes the new.
  changedFiles.sort((a, b) => Number(b.deleted) - Number(a.deleted))

  res.json({
    cursor: cursor.toISOString(),
    can: drive.can,
    folders: changedFolders,
    files: changedFiles,
    gone: first ? [] : gone,
  })
})

// The secret this account's computers share for LAN sync (apps/desktop
// lan.ts): with it they recognise each other on a network and encrypt what
// they send one another, and nobody else there can. Derived rather than
// stored, and a new one each UTC day, so a computer whose token was revoked
// is locked out of the others' traffic by the next day. Clients ask again
// hourly; two that straddle midnight just miss each other until they do.
syncRouter.get("/lan-key", (req, res) => {
  const day = Math.floor(Date.now() / 86_400_000)
  res.json({
    key: crypto.createHmac("sha256", env.SESSION_SECRET).update(`lan:${currentUser(req).id}:${day}`).digest("hex"),
  })
})

// The synced folders, for the desktop app's "sync one here" picker: the
// user's own, and those shared with them, which say whose they are.
syncRouter.get("/folders", async (req, res) => {
  const user = currentUser(req)
  const parentId = await assertUserSyncRootId(user)
  const rows = await prisma.folder.findMany({
    where: { isTrashed: false, OR: [{ parentId }, { members: { some: { userId: user.id } } }] },
    select: { id: true, name: true, ownerId: true, owner: { select: { name: true } } },
    orderBy: { name: "asc" },
  })
  res.json(
    rows.map((f) => ({ id: f.id, name: f.name, ...(f.ownerId !== user.id && { sharedBy: f.owner.name }) }))
  )
})

// One of the user's own synced folders, or null: only its owner shares one.
async function ownSynced(user: User, id: string) {
  return prisma.folder.findFirst({
    where: { id, ownerId: user.id, parentId: await assertUserSyncRootId(user), isTrashed: false },
    select: { id: true, name: true },
  })
}

// Who a synced folder is shared with, and what each may do in it.
syncRouter.get("/folders/:id/members", async (req, res) => {
  const folder = await ownSynced(currentUser(req), req.params.id)
  if (!folder) return res.status(404).json({ error: "not_found" })
  const members = await prisma.folderMember.findMany({
    where: { folderId: folder.id },
    select: {
      canUpload: true, canDelete: true,
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "asc" },
  })
  res.json({ members: members.map(({ user, ...can }) => ({ ...user, ...can })) })
})

const Can = z.enum(["NO", "ASK", "YES"])

// Share a synced folder with another account, which can then keep it on its
// own computers too, or change what someone it's already shared with may do
// (their sync clients hear with their next poll). Not from a temporary login,
// like every other way of handing out access.
syncRouter.post("/folders/:id/members", denyTempSession, async (req, res) => {
  const user = currentUser(req)
  const body = z
    .object({ email: z.string().email(), canUpload: Can.optional(), canDelete: Can.optional() })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: "invalid" })
  const { email, ...can } = body.data
  const folder = await ownSynced(user, req.params.id)
  if (!folder) return res.status(404).json({ error: "not_found" })
  const target = await prisma.user.findUnique({ where: { email } })
  if (!target) return res.status(404).json({ error: "user_not_found" })
  if (target.id === user.id) return res.status(400).json({ error: "already_owner" })
  const key = { folderId: folder.id, userId: target.id }
  const had = await prisma.folderMember.findUnique({ where: { folderId_userId: key } })
  await prisma.folderMember.upsert({
    where: { folderId_userId: key },
    update: can,
    create: { ...key, ...can },
  })
  if (!had)
    void notify(target.id, {
      type: "folder_share",
      title: `${user.name} shared the synced folder "${folder.name}" with you`,
      body: "To keep it on your computer too, add it in the DarkDrive app's sync settings.",
      link: `/drive/${folder.id}`,
    })
  res.status(201).json({ ok: true })
})

// Stop sharing with someone. What they added stays in the folder, and stays
// theirs; their computers keep their copies and stop syncing them.
syncRouter.delete("/folders/:id/members/:userId", async (req, res) => {
  const folder = await ownSynced(currentUser(req), req.params.id)
  if (!folder) return res.status(404).json({ error: "not_found" })
  const { count } = await prisma.folderMember.deleteMany({
    where: { folderId: folder.id, userId: req.params.userId },
  })
  if (count)
    void notify(req.params.userId, {
      type: "folder_share",
      title: `"${folder.name}" is no longer shared with you`,
      body: "Your computers keep their copies, which no longer sync.",
    })
  res.json({ ok: true })
})

// What waits on the user in one of their synced folders: files that members
// who have to ask have added, or want binned (File.pending).
async function requestsIn(user: User, rootId: string) {
  const files = await prisma.file.findMany({
    where: { pending: { not: null }, isTrashed: false, spaceId: null, folder: { ownerId: user.id } },
    select: { id: true, name: true, folderId: true, size: true, pending: true, pendingById: true },
    orderBy: { updatedAt: "asc" },
  })
  if (!files.length) return []
  const pathOf = pathBuilder((await loadDrive(user, undefined)).byId, rootId)
  const askers = await prisma.user.findMany({
    where: { id: { in: files.flatMap((f) => f.pendingById ?? []) } },
    select: { id: true, name: true },
  })
  const names = new Map(askers.map((u) => [u.id, u.name]))
  return files.flatMap((f) => {
    const dir = pathOf(f.folderId)
    if (dir === null) return []
    return {
      id: f.id,
      path: dir === "" ? f.name : `${dir}/${f.name}`,
      size: Number(f.size),
      kind: f.pending as "upload" | "delete",
      byId: f.pendingById,
      by: names.get(f.pendingById ?? "") ?? "Someone",
    }
  })
}

syncRouter.get("/folders/:id/requests", async (req, res) => {
  const user = currentUser(req)
  const folder = await ownSynced(user, req.params.id)
  if (!folder) return res.status(404).json({ error: "not_found" })
  res.json({ requests: await requestsIn(user, folder.id) })
})

// The owner's answer to some of them. Yes to an added file shows it to
// everyone, no bins it (its uploader's bin: the file is theirs). Yes to a
// delete bins the file, no leaves it be. Either way it stops waiting, and the
// bump in updatedAt is what carries the outcome to every sync client.
syncRouter.post("/folders/:id/requests", async (req, res) => {
  const user = currentUser(req)
  const body = z
    .object({ ids: z.array(z.string()).min(1).max(1000), approve: z.boolean() })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: "invalid" })
  const { approve } = body.data
  const folder = await ownSynced(user, req.params.id)
  if (!folder) return res.status(404).json({ error: "not_found" })
  // Through the same listing, so an id is only ever one waiting in this folder.
  const ids = new Set(body.data.ids)
  const rows = (await requestsIn(user, folder.id)).filter((r) => ids.has(r.id))
  for (const kind of ["upload", "delete"] as const) {
    const of = rows.filter((r) => r.kind === kind).map((r) => r.id)
    if (of.length)
      await prisma.file.updateMany({
        where: { id: { in: of } },
        data: { pending: null, pendingById: null, isTrashed: (kind === "upload") !== approve },
      })
  }
  const askers = new Map<string, number>()
  for (const r of rows) if (r.byId) askers.set(r.byId, (askers.get(r.byId) ?? 0) + 1)
  for (const [to, n] of askers)
    void notify(to, {
      type: "folder_share",
      title: `${user.name} ${approve ? "agreed to" : "declined"} ${n} ${n === 1 ? "change" : "changes"} of yours in "${folder.name}"`,
      ...(!approve && { body: "Anything you added that was declined is in your bin." }),
      link: `/drive/${folder.id}`,
    })
  res.json({ ok: true, count: rows.length })
})

// A new synced folder, for a folder the desktop app starts syncing from its
// computer. Two computers can each have an "Important Docs" with nothing in
// common, and quietly merging them would be a nasty surprise, so the second
// becomes "Important Docs (2)". Joining an existing one is the picker above.
syncRouter.post("/folders", async (req, res) => {
  const user = currentUser(req)
  const body = z.object({ name: z.string().trim().min(1).max(255) }).safeParse(req.body)
  if (!body.success || /[\\/]/.test(body.data.name) || body.data.name === "." || body.data.name === "..")
    return res.status(400).json({ error: "bad_name" })
  const parentId = await assertUserSyncRootId(user)
  const taken = new Set(
    (await prisma.folder.findMany({ where: { parentId, isTrashed: false }, select: { name: true } })).map((f) => f.name)
  )
  let name = body.data.name
  for (let i = 2; taken.has(name); i++) name = `${body.data.name} (${i})`
  res.status(201).json(
    await prisma.folder.create({ data: { name, ownerId: user.id, parentId }, select: { id: true, name: true } })
  )
})

// Resolve a path to a folder id, creating any missing segments. Sync clients
// work in paths; every other write endpoint works in folder ids. `root`
// scopes it the same way as /changes.
syncRouter.post("/folder", async (req, res) => {
  const user = currentUser(req)
  const body = z.object({ path: z.string().max(4096), root: z.string().optional() }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: "invalid" })
  const { path } = body.data
  const drive = await loadDrive(user, body.data.root)
  const rootId = syncRoot(drive, body.data.root)
  if (!rootId) return res.status(404).json({ error: "sync_root_gone" })
  // A folder is only somewhere to put files, so having to ask is enough.
  if (drive.can.upload === "NO") return res.status(403).json({ error: "forbidden" })
  // Folders belong to the tree they're in, so a member's are the owner's.
  const ownerId = drive.ownerId

  let parentId = rootId
  const parts = path.split("/").map((s) => s.trim()).filter(Boolean)
  if (parts.length > MAX_DEPTH) return res.status(400).json({ error: "too_deep" })

  for (const name of parts) {
    if (name === "." || name === "..") return res.status(400).json({ error: "bad_path" })
    const existing = await prisma.folder.findFirst({
      where: { ownerId, parentId, name, isTrashed: false },
      select: { id: true },
    })
    parentId = existing
      ? existing.id
      : (await prisma.folder.create({ data: { name, ownerId, parentId } })).id
  }
  res.json({ id: parentId })
})
