import { prisma } from "../db/prisma.js"
import type { Folder, File as FileRec, SpaceRole, User } from "@prisma/client"

export type AccessMode = "read" | "write" | "admin"

export async function getFolderWithAccess(
  userId: string,
  folderId: string,
  mode: AccessMode = "read"
): Promise<Folder | null> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    include: { space: { include: { members: true } } },
  })
  if (!folder) return null
  if (folder.ownerId === userId) return folder
  if (folder.spaceId && folder.space) {
    const m = folder.space.members.find((mm) => mm.userId === userId)
    if (!m) return null
    if (mode === "read") return folder
    if (mode === "write" && (m.role === "EDITOR" || m.role === "ADMIN")) return folder
    if (mode === "admin" && m.role === "ADMIN") return folder
  }
  return null
}

export async function getFileWithAccess(
  userId: string,
  fileId: string,
  mode: AccessMode = "read"
): Promise<FileRec | null> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: { space: { include: { members: true } } },
  })
  if (!file) return null
  if (file.ownerId === userId) return file
  if (file.spaceId && file.space) {
    const m = file.space.members.find((mm) => mm.userId === userId)
    if (!m) return null
    if (mode === "read") return file
    if (mode === "write" && (m.role === "EDITOR" || m.role === "ADMIN")) return file
    if (mode === "admin" && m.role === "ADMIN") return file
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
