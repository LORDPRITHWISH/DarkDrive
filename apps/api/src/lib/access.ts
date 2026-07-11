import { prisma } from "../db/prisma.js"
import type { Folder, File as FileRec, SpaceRole, User, UserRole } from "@prisma/client"

export type AccessMode = "read" | "write" | "admin"
export type AccessOpts = { role?: UserRole }

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
    if (m) {
      if (mode === "read") return folder
      // Legacy ADMIN roles are treated as EDITOR — only the owner can do admin.
      if (mode === "write" && (m.role === "EDITOR" || m.role === "ADMIN"))
        return folder
    }
    // Public spaces grant read access to any authenticated user; writes
    // still require explicit membership or ownership.
    if (mode === "read" && folder.space.isPublic) return folder
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
    include: { space: { include: { members: true } } },
  })
  if (!file) return null
  // See getFolderWithAccess — same read-only admin bypass. findUnique isn't
  // filtered by isTrashed, so this also covers files retained in the admin
  // recycle bin (their blob is kept on disk until purged).
  if (opts?.role === "ADMIN" && mode === "read") return file
  if (file.ownerId === userId) return file
  if (file.spaceId && file.space) {
    if (file.space.ownerId === userId) return file
    const m = file.space.members.find((mm) => mm.userId === userId)
    if (m) {
      if (mode === "read") return file
      if (mode === "write" && (m.role === "EDITOR" || m.role === "ADMIN"))
        return file
    }
    if (mode === "read" && file.space.isPublic) return file
  }
  // Read access via a shortcut: file is surfaced in a folder the user can reach.
  // Shortcuts only grant read — not write/admin — since the file's home is the
  // uploader's drive.
  if (mode === "read") {
    const linked = await prisma.fileShortcut.findFirst({
      where: {
        fileId: file.id,
        folder: {
          OR: [
            { ownerId: userId },
            { space: { members: { some: { userId } } } },
            // A file surfaced via a shortcut inside a public space is readable
            // by any authenticated user — same rule as content owned directly
            // by the space (file.spaceId set), just reached through the link.
            { space: { isPublic: true } },
          ],
        },
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
