import type { Request, Response, NextFunction } from "express"
import type { User } from "@prisma/client"

declare global {
  namespace Express {
    interface User extends Omit<import("@prisma/client").User, never> {
      // Set when this browser signed in with a temporary code — see
      // routes/tempSessions.ts.
      tempSession?: { id: string; expiresAt: Date }
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" })
  next()
}

// Temporary sessions are for moving files on a device you don't trust.
// Anything that would outlive the session — minting a device token or
// another temp code, linking Telegram, handing out share or invite links —
// or reach admin powers is refused, so it really is over when it expires.
export function denyTempSession(req: Request, res: Response, next: NextFunction) {
  if (req.user?.tempSession) {
    return res.status(403).json({ error: "not_allowed_in_temp_session" })
  }
  next()
}

export function currentUser(req: Request): User {
  return req.user as User
}
