import { prisma } from "../db/prisma.js"
import { getIO } from "../realtime/socket.js"

// Fixed set of notification types the client knows how to render an
// icon/label for (see apps/web/src/components/NotificationBell.tsx).
export type NotificationType =
  | "space_invite"
  | "space_role_changed"
  | "space_removed"
  | "space_access_requested"
  | "space_access_denied"
  | "folder_share"
  | "quota_upgrade_approved"
  | "quota_upgrade_denied"
  | "quota_changed"
  | "quota_near_limit"

export async function notify(
  userId: string,
  input: { type: NotificationType; title: string; body?: string; link?: string }
) {
  const n = await prisma.notification.create({
    data: {
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    },
  })
  // Best-effort realtime push — the REST list is the source of truth for
  // anyone not currently connected.
  getIO()
    ?.to(`user:${userId}`)
    .emit("notification:new", { ...n, createdAt: n.createdAt.toISOString() })
  return n
}

// Tells the owner of a shared synced folder or a space that a member's change
// waits for their yes (File.pending, FileShortcut.pending). `rootId` is its
// top folder (Member.root). Once per member and place until it's read: a sync
// client asks about a hundred files one at a time.
export async function notifyRequest(rootId: string, by: { name: string }) {
  const root = await prisma.folder.findUnique({
    where: { id: rootId },
    select: {
      name: true, ownerId: true, parentId: true,
      spaceRootOf: { select: { id: true, name: true, ownerId: true } },
    },
  })
  if (!root) return
  const space = root.spaceRootOf
  const to = space?.ownerId ?? root.ownerId
  const title = `${by.name} has changes waiting for your OK in "${space?.name ?? root.name}"`
  const unread = await prisma.notification.findFirst({
    where: { userId: to, type: "folder_share", title, readAt: null },
  })
  if (unread) return
  await notify(to, {
    type: "folder_share",
    title,
    body: space
      ? "Managing the space lists them, to agree to or decline."
      : "Share… on the folder lists them, to agree to or decline.",
    // The space, or where the folder is listed and so where its Share… is.
    link: space ? `/spaces/${space.id}` : `/drive/${root.parentId}`,
  })
}

const QUOTA_NEAR_LIMIT_THRESHOLD = 0.9
// Hundredths of a percent of headroom when scaling the bigint ratio down to a
// JS number — precise enough that the 90% threshold can't be tipped by
// Number()'s 2^53 precision loss on multi-terabyte byte counts.
const PCT_SCALE = 10_000n
// Don't re-notify on every upload once a user is already over the
// threshold — only once per rolling day.
const QUOTA_NEAR_LIMIT_COOLDOWN_MS = 24 * 60 * 60 * 1000

// Fires a one-time-per-day nudge once storage use crosses 90% of quota.
// Called after each completed upload with the freshly-recomputed usage.
export async function maybeNotifyQuotaNearLimit(
  userId: string,
  usedBytes: bigint,
  quotaBytes: bigint
) {
  if (quotaBytes <= BigInt(0)) return
  // Ratio stays in bigint math until the very end — only the small scaled
  // integer (0..~PCT_SCALE-ish) is converted to a Number.
  const pct = Number((usedBytes * PCT_SCALE) / quotaBytes) / Number(PCT_SCALE)
  if (pct < QUOTA_NEAR_LIMIT_THRESHOLD) return

  const recent = await prisma.notification.findFirst({
    where: {
      userId,
      type: "quota_near_limit",
      createdAt: { gte: new Date(Date.now() - QUOTA_NEAR_LIMIT_COOLDOWN_MS) },
    },
  })
  if (recent) return

  await notify(userId, {
    type: "quota_near_limit",
    title:
      pct >= 1
        ? "You've run out of storage"
        : `You've used ${Math.floor(pct * 100)}% of your storage`,
    body: "Free up space or request a quota increase.",
  })
}
