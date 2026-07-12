import { Router } from "express"
import { z } from "zod"
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

// Password-less login-by-email for local development only. Gated on
// NODE_ENV being exactly "development" (not merely "not production" — a
// "test" environment pointed at real data should never expose this either)
// AND an explicit opt-in flag. The whole block, including the status probe,
// is skipped outside dev so these routes don't exist at all elsewhere — a
// request 404s instead of a status endpoint confirming the feature exists.
if (env.NODE_ENV === "development") {
  const devLoginEnabled = env.ENABLE_DEV_LOGIN

  if (devLoginEnabled) {
    console.warn(
      "[api] DEV LOGIN IS ENABLED — do not point this at a database with real user data"
    )
  }

  authRouter.get("/dev-login/status", (_req, res) => {
    res.json({ enabled: devLoginEnabled })
  })

  if (devLoginEnabled) {
    authRouter.post("/dev-login", async (req, res) => {
      // safeParse, not parse: a thrown ZodError inside an async Express 4
      // handler becomes an unhandled promise rejection (Express 4 doesn't
      // await handlers), which crashes the process under Node's default
      // "throw" unhandled-rejection policy. Handling it inline keeps this
      // route crash-proof regardless of that wider, pre-existing gap.
      const parsed = z
        .object({ email: z.string().trim().toLowerCase().email() })
        .safeParse(req.body)
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid", issues: parsed.error.issues })
      }
      const { email } = parsed.data

      let user = await prisma.user.findUnique({ where: { email } })
      if (!user) {
        user = await prisma.$transaction(async (tx) => {
          // Mirrors the Google OAuth bootstrap: first-ever user becomes ADMIN.
          const isFirst = (await tx.user.count()) === 0
          const created = await tx.user.create({
            data: {
              googleId: `dev-login:${email}`,
              email,
              name: email.split("@")[0],
              role: isFirst ? "ADMIN" : "USER",
            },
          })
          const root = await tx.folder.create({
            data: { name: "My Drive", ownerId: created.id },
          })
          return tx.user.update({ where: { id: created.id }, data: { rootFolderId: root.id } })
        })
      }

      req.login(user, (err) => {
        if (err) return res.status(500).json({ error: "login_failed" })
        res.json({ ok: true })
      })
    })
  }
}

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
