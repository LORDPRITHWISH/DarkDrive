import crypto from "node:crypto"
import { Router } from "express"
import type { Request, Response, NextFunction } from "express"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { redis } from "../db/redis.js"
import { env } from "../env.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { newToken } from "../auth/deviceToken.js"

export const devicesRouter = Router()

// The link the sync client and apps open to pair. The page lives in the web app
// now; this stays so already-shipped clients keep working. The query string is
// passed through untouched — the desktop app's ?port=&state=&name= is what
// switches the page to its one-click "Allow" flow.
devicesRouter.get("/pair", (req, res) => {
  res.redirect(`${env.WEB_URL}/pair${new URL(req.originalUrl, env.APP_URL).search}`)
})

// Express 4 doesn't await handlers: a rejection (a ZodError from a bad body,
// Redis down) would go unhandled and take the process with it. This routes it
// to the error middleware instead, which answers 400/500. /claim is
// unauthenticated, so without it any stranger could crash the API.
const safe =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next)

const PAIR_CODE_TTL_S = 120
const deviceName = z.string().trim().min(1).max(60)

async function mintToken(userId: string, name: string) {
  const { raw, hash } = newToken()
  const device = await prisma.deviceToken.create({
    data: { userId, name, tokenHash: hash },
    select: { id: true, name: true, createdAt: true },
  })
  return { ...device, token: raw }
}

// Unauthenticated on purpose: holding the code is the proof. It's 256 random
// bits, single-use and gone in two minutes, so there's nothing to rate-limit.
// The token is only minted here, so a code nobody claims leaves no device row.
devicesRouter.post(
  "/claim",
  safe(async (req, res) => {
    const { code } = z.object({ code: z.string().max(100) }).parse(req.body)
    const key = `dd:pair:${code}`
    // GET+DEL in one MULTI so two racing claims can't both win.
    const [[, pending]] = await redis.multi().get(key).del(key).exec()
    if (!pending) return res.status(404).json({ error: "expired" })
    const { userId, name } = JSON.parse(pending) as {
      userId: string
      name: string
    }
    res.status(201).json(await mintToken(userId, name))
  })
)

devicesRouter.use(requireAuth)

devicesRouter.post(
  "/",
  safe(async (req, res) => {
    const { name } = z.object({ name: deviceName }).parse(req.body)
    // Only time the plaintext ever leaves the server.
    res.status(201).json(await mintToken(currentUser(req).id, name))
  })
)

// The "Allow" button on the web app's /pair page. Returns a code rather than
// the token because the code then travels in a URL, and URLs land in browser
// history, which syncs.
devicesRouter.post(
  "/pair-code",
  safe(async (req, res) => {
    const { name } = z.object({ name: deviceName }).parse(req.body)
    const code = crypto.randomBytes(32).toString("base64url")
    await redis.set(
      `dd:pair:${code}`,
      JSON.stringify({ userId: currentUser(req).id, name }),
      "EX",
      PAIR_CODE_TTL_S
    )
    res.status(201).json({ code })
  })
)

devicesRouter.get("/", async (req, res) => {
  const user = currentUser(req)
  res.json(
    await prisma.deviceToken.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, lastSeenAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    })
  )
})

devicesRouter.delete("/:id", async (req, res) => {
  const user = currentUser(req)
  // deleteMany scoped by userId so one user can't revoke another's device.
  const { count } = await prisma.deviceToken.deleteMany({
    where: { id: req.params.id, userId: user.id },
  })
  if (!count) return res.status(404).json({ error: "not_found" })
  res.json({ ok: true })
})
