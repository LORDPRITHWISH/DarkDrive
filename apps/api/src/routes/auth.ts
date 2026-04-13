import { Router } from "express"
import { passport } from "../auth/passport.js"
import { env } from "../env.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { assertUserRootFolderId } from "../lib/access.js"

export const authRouter = Router()

authRouter.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
)

authRouter.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: `${env.WEB_URL}/login?error=oauth` }),
  (_req, res) => {
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
  })
})
