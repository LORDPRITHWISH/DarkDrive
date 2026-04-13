import type { Request, Response, NextFunction } from "express"
import type { User } from "@prisma/client"

declare global {
  namespace Express {
    interface User extends Omit<import("@prisma/client").User, never> {}
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" })
  next()
}

export function currentUser(req: Request): User {
  return req.user as User
}
