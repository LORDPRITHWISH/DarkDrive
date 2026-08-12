import type { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma.js"

export type ActivityAction =
  | "view"
  | "download"
  | "upload"
  | "create"
  | "rename"
  | "move"
  | "star"
  | "unstar"
  | "trash"
  | "restore"
  | "delete"
  | "share"
  | "unshare"
  | "version"
  | "version_restore"
  | "color"
  | "thumbnail"
  | "owner"

export type ActivityEvent = {
  action: string
  at: string
  user: { name: string; avatarUrl: string | null } | null
  detail?: Record<string, unknown> | null
}

// Records one audit-trail entry for a file or folder mutation. Fire-and-forget
// from call sites' point of view (the mutation itself already succeeded by the
// time this runs) but callers still await it so a logging failure surfaces
// rather than vanishing silently.
export function logActivity(opts: {
  userId: string
  action: ActivityAction
  fileId?: string
  folderId?: string
  detail?: Record<string, unknown>
}) {
  return prisma.activityLog.create({
    data: {
      userId: opts.userId,
      action: opts.action,
      fileId: opts.fileId ?? null,
      folderId: opts.folderId ?? null,
      detail: opts.detail as Prisma.InputJsonValue | undefined,
    },
  })
}

// Combines two already-sorted-desc event lists (e.g. FileAccess reads +
// ActivityLog mutations) into one feed, newest first, capped at `limit`.
export function mergeActivityEvents(
  a: ActivityEvent[],
  b: ActivityEvent[],
  limit: number
): ActivityEvent[] {
  return [...a, ...b].sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, limit)
}
