import crypto from "node:crypto"
import type { Request, Response, NextFunction } from "express"
import { prisma } from "../db/prisma.js"

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex")
}

export function newToken(): { raw: string; hash: string } {
  const raw = `dd_${crypto.randomBytes(32).toString("base64url")}`
  return { raw, hash: hashToken(raw) }
}

// Authenticates non-browser clients (sync daemon, mobile app) from an
// `Authorization: Bearer <token>` header. Runs after passport.session() and
// only fills in req.user when a cookie session hasn't already, so every
// existing requireAuth route works unchanged for both kinds of client.
//
// The lookup is by sha256 on a unique index — no plaintext comparison, so
// there's no secret-dependent branch to time.
export async function bearerAuth(req: Request, _res: Response, next: NextFunction) {
  if (req.user) return next()
  const header = req.get("authorization")
  if (!header?.startsWith("Bearer ")) return next()

  const row = await prisma.deviceToken.findUnique({
    where: { tokenHash: hashToken(header.slice(7).trim()) },
    include: { user: true },
  })
  // Same posture as passport's deserializeUser: a disabled account reads as
  // logged out, so revoking access kills device tokens too.
  if (!row || row.user.disabledAt) return next()

  req.user = row.user
  // Fire-and-forget — last-seen only feeds the device list, not worth a
  // round-trip on the request path.
  prisma.deviceToken
    .update({ where: { id: row.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {})
  next()
}
