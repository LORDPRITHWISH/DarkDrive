import { Router } from "express"
import { passport } from "../auth/passport.js"
import { env } from "../env.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { assertUserRootFolderId } from "../lib/access.js"
import { prisma } from "../db/prisma.js"

export const authRouter = Router()

authRouter.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
)

authRouter.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: `${env.WEB_URL}/login?error=oauth` }),
  (req, res) => {
    if (req.user) {
      const ip =
        (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
        req.ip ||
        null
      prisma.loginEvent
        .create({
          data: {
            userId: (req.user as { id: string }).id,
            ip,
            userAgent: req.get("user-agent") ?? null,
          },
        })
        .catch(() => {})
    }
    res.redirect(`${env.WEB_URL}/`)
  }
)

authRouter.post("/logout", (req, res) => {
  req.logout(() => {
    req.session?.destroy(() => {
      res.clearCookie("dd.sid")
      res.json({ ok: true })
    })
  })
})

authRouter.get("/me", requireAuth, async (req, res) => {
  const u = currentUser(req)
  const rootFolderId = await assertUserRootFolderId(u)
  res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    rootFolderId,
    role: u.role,
    storageQuotaBytes: Number(u.storageQuotaBytes),
  })
})
