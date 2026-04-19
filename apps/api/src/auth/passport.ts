import passport from "passport"
import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import { prisma } from "../db/prisma.js"
import { env } from "../env.js"

passport.serializeUser((user: any, done) => done(null, user.id))

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } })
    done(null, user ?? false)
  } catch (e) {
    done(e as Error)
  }
})

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
    },
    async (_at, _rt, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value
        if (!email) return done(new Error("No email on Google profile"))

        const existing = await prisma.user.findUnique({ where: { googleId: profile.id } })
        if (existing) return done(null, existing)

        const user = await prisma.$transaction(async (tx) => {
          // First-ever user bootstraps as ADMIN so there's no SQL-only escape hatch.
          const isFirst = (await tx.user.count()) === 0
          const u = await tx.user.create({
            data: {
              googleId: profile.id,
              email,
              name: profile.displayName || email,
              avatarUrl: profile.photos?.[0]?.value,
              role: isFirst ? "ADMIN" : "USER",
            },
          })
          const root = await tx.folder.create({
            data: { name: "My Drive", ownerId: u.id },
          })
          return tx.user.update({ where: { id: u.id }, data: { rootFolderId: root.id } })
        })

        done(null, user)
      } catch (e) {
        done(e as Error)
      }
    }
  )
)

export { passport }
