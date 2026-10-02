import { prisma } from "../db/prisma.js"
import type { Folder, File as FileRec, MemberCan, SpaceRole, User, UserRole } from "@prisma/client"

// "add" and "trash" are what a member may be allowed without the rest of
// "write": putting a new file in, binning one. For an owner they are "write".
export type AccessMode = "read" | "add" | "trash" | "write" | "admin"
export type AccessOpts = { role?: UserRole }

// The permission layer of everything that has members. A shared synced folder
// (FolderMember) and a space (SpaceMember) are different things with their
// own members, routes and rules for what a file in them is, but what a member
// may do in either is these two settings, and memberMay decides for both.
export type Can = { upload: MemberCan; delete: MemberCan }
/** A member's settings, which kind of thing they are a member of, and its top folder. */
export type Member = Can & { kind: "folder" | "space"; root: string }

// A space member's settings. Rows from before the settings existed, and ones
// made by joining or an invite link, only have a role: a viewer may do
// neither, an editor both (a legacy ADMIN is an editor).
export const spaceCan = (m: {
  role: SpaceRole
  canUpload: MemberCan | null
  canDelete: MemberCan | null
}): Can => {
  const fromRole = m.role === "VIEWER" ? "NO" : "YES"
  return { upload: m.canUpload ?? fromRole, delete: m.canDelete ?? fromRole }
}

// The shared synced folder `userId` is a member of that `folderId` is, or is
// inside. One query walking up the parents; UNION rather than UNION ALL, so a
// parent cycle ends the walk instead of looping.
async function folderMember(userId: string, folderId: string): Promise<Member | null> {
  const rows = await prisma.$queryRaw<(Can & { root: string })[]>`
    WITH RECURSIVE up AS (
      SELECT id, "parentId" FROM "Folder" WHERE id = ${folderId}
      UNION
      SELECT f.id, f."parentId" FROM "Folder" f JOIN up ON f.id = up."parentId"
    )
    SELECT m."folderId" AS root, m."canUpload"::text AS upload, m."canDelete"::text AS "delete"
    FROM up JOIN "FolderMember" m ON m."folderId" = up.id
    WHERE m."userId" = ${userId} LIMIT 1`
  return rows[0] ? { kind: "folder", ...rows[0] } : null
}

// What `userId` is a member of at `folderId`, a space or a shared synced
// folder, or null: an owner isn't a member, and neither is a stranger. For
// the routes, which then hold a change that has to be asked for and guard the
// way out of the thing, the same for both kinds.
export async function memberOf(userId: string, folderId: string): Promise<Member | null> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { space: { select: { ownerId: true, rootFolderId: true, members: { where: { userId } } } } },
  })
  if (!folder) return null
  if (!folder.space) return folderMember(userId, folderId)
  const m = folder.space.members[0]
  if (!m || folder.space.ownerId === userId) return null
  return { kind: "space", root: folder.space.rootFolderId, ...spaceCan(m) }
}

// For a listing: leaves out what another member added that the owner hasn't
// agreed to yet, a file in a shared synced folder or a link in a space. The
// owner is shown those, being the one asked, so this is for everyone else.
// (Spelled as what stays in: `pending: { not: "upload" }` would drop every
// row where it's null.)
export const visibleTo = (userId: string) => ({
  OR: [{ pending: null }, { pending: "delete" }, { pendingById: userId }],
})

// Asking (ASK) is enough for "add" and "trash": the route then makes what was
// asked for wait on the owner. Deleting for good is never a member's.
function memberMay(m: Can, mode: AccessMode): boolean {
  if (mode === "read") return true
  if (mode === "write") return m.upload === "YES"
  if (mode === "add") return m.upload !== "NO"
  if (mode === "trash") return m.delete !== "NO"
  return false
}

export async function getFolderWithAccess(
  userId: string,
  folderId: string,
  mode: AccessMode = "read",
  opts?: AccessOpts
): Promise<Folder | null> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    include: { space: { include: { members: true } } },
  })
  if (!folder) return null
  // System admins can view (but not modify) any folder — deliberately scoped
  // to read-only call sites (folder contents, thumbnails) so admins retain
  // full visibility without silently gaining write/delete power over other
  // users' data through the normal endpoints.
  if (opts?.role === "ADMIN" && mode === "read") return folder
  if (folder.ownerId === userId) return folder
  if (folder.spaceId && folder.space) {
    // The space creator is implicitly admin of the space — no SpaceMember row
    // required. All other admin-level actions are restricted to the owner.
    if (folder.space.ownerId === userId) return folder
    const m = folder.space.members.find((mm) => mm.userId === userId)
    if (m && memberMay(spaceCan(m), mode)) return folder
    // Public spaces grant read access to any authenticated user; writes
    // still require explicit membership or ownership.
    if (mode === "read" && folder.space.isPublic) return folder
  }
  // A shared synced folder is its members' all the way down, as far as each
  // one's settings go.
  if (!folder.spaceId) {
    const m = await folderMember(userId, folder.id)
    if (m && memberMay(m, mode)) return folder
  }
  return null
}

export async function getFileWithAccess(
  userId: string,
  fileId: string,
  mode: AccessMode = "read",
  opts?: AccessOpts
): Promise<FileRec | null> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: {
      space: { include: { members: true } },
      folder: { select: { ownerId: true, spaceId: true } },
    },
  })
  if (!file) return null
  // See getFolderWithAccess — same read-only admin bypass. findUnique isn't
  // filtered by isTrashed, so this also covers files retained in the admin
  // recycle bin (their blob is kept on disk until purged).
  if (opts?.role === "ADMIN" && mode === "read") return file
  // A file in a synced folder belongs to whoever added it, which may be
  // neither the folder's owner nor the member asking. So there the folder
  // decides, ahead of whose file it is: a member can do what their settings
  // allow, to their own files as much as anyone's. The one thing that is
  // theirs alone is a file they added that still waits for the owner's yes:
  // no other member can so much as read it.
  const synced = !file.spaceId && !file.folder.spaceId
  if (synced && file.folder.ownerId !== userId) {
    const m = await folderMember(userId, file.folderId)
    if (m) {
      if (file.pending === "upload") return file.ownerId === userId ? file : null
      return memberMay(m, mode) ? file : null
    }
  }
  if (file.ownerId === userId) return file
  if (file.spaceId && file.space) {
    if (file.space.ownerId === userId) return file
    const m = file.space.members.find((mm) => mm.userId === userId)
    if (m && memberMay(spaceCan(m), mode)) return file
    if (mode === "read" && file.space.isPublic) return file
  }
  // The folder's owner can do anything with what's in it.
  if (synced && file.folder.ownerId === userId) return file
  // Read access via a shortcut: file is surfaced in a folder the user can reach.
  // Shortcuts only grant read — not write/admin — since the file's home is the
  // uploader's drive.
  if (mode === "read") {
    // A link a member added that still waits for the space owner's yes is
    // nobody's way in yet, bar the owner whose folder it sits in.
    const shown = visibleTo(userId)
    const linked = await prisma.fileShortcut.findFirst({
      where: {
        fileId: file.id,
        OR: [
          { folder: { ownerId: userId } },
          { ...shown, folder: { space: { members: { some: { userId } } } } },
          // A file surfaced via a shortcut inside a public space is readable
          // by any authenticated user — same rule as content owned directly
          // by the space (file.spaceId set), just reached through the link.
          { ...shown, folder: { space: { isPublic: true } } },
        ],
      },
    })
    if (linked) return file
  }
  return null
}

export function spaceRoleCan(role: SpaceRole | undefined | null, mode: AccessMode): boolean {
  if (!role) return false
  if (mode === "read") return true
  if (mode === "write") return role === "EDITOR" || role === "ADMIN"
  return role === "ADMIN"
}

export async function assertUserRootFolderId(user: User): Promise<string> {
  if (user.rootFolderId) return user.rootFolderId
  const root = await prisma.folder.create({ data: { name: "My Drive", ownerId: user.id } })
  await prisma.user.update({ where: { id: user.id }, data: { rootFolderId: root.id } })
  return root.id
}

// The gallery's root folder, created on first use exactly like the drive root
// above. It is a *second* root (parentId null), not a child of "My Drive", so
// photos never show up inside the drive tree — while still being ordinary
// files owned by the user, and so charged against the same storage quota.
export async function assertUserPhotosRootId(user: User): Promise<string> {
  if (user.photosRootFolderId) return user.photosRootFolderId
  const root = await prisma.folder.create({ data: { name: "My Photos", ownerId: user.id } })
  await prisma.user.update({ where: { id: user.id }, data: { photosRootFolderId: root.id } })
  return root.id
}

// "Synced Folders", a third root made the same way. The desktop app puts one
// folder in it per folder it syncs (see routes/sync.ts).
export async function assertUserSyncRootId(user: User): Promise<string> {
  if (user.syncRootFolderId) return user.syncRootFolderId
  const root = await prisma.folder.create({ data: { name: "Synced Folders", ownerId: user.id } })
  await prisma.user.update({ where: { id: user.id }, data: { syncRootFolderId: root.id } })
  return root.id
}
