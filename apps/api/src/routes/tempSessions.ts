import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { redis } from "../db/redis.js"
import { hashToken } from "../auth/deviceToken.js"
import { currentUser, denyTempSession, requireAuth } from "../middleware/auth.js"
import { newTempCode, normalizeTempCode } from "../lib/tempCode.js"
import { getIO } from "../realtime/socket.js"

// Temporary logins for untrusted devices — see the TempSession model.
export const tempSessionsRouter = Router()

// Unauthenticated: this *is* the login. safeParse rather than parse, for the
// same reason as dev-login in auth.ts — a throw in an async Express 4
// handler is an unhandled rejection, not a 400.
tempSessionsRouter.post("/claim", async (req, res) => {
  // A login link opened on a browser that already has a full session (sent
  // to yourself, opened on your own laptop) would burn the code *and*
  // downgrade that session to a restricted one. Refuse before touching it.
  if (req.user && !req.user.tempSession) {
    return res.status(409).json({ error: "already_signed_in" })
  }

  // The keyspace already makes guessing hopeless; this just stops anyone
  // from trying.
  const limitKey = `dd:tmpclaim:${req.ip}`
  const attempts = await redis.incr(limitKey)
  if (attempts === 1) await redis.expire(limitKey, 15 * 60)
  if (attempts > 20) return res.status(429).json({ error: "too_many_attempts" })

  const parsed = z.object({ code: z.string().max(64) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "invalid" })
  const codeHash = hashToken(normalizeTempCode(parsed.data.code))

  const row = await prisma.tempSession.findUnique({
    where: { codeHash },
    include: { user: true },
  })
  if (!row || row.expiresAt <= new Date() || row.user.disabledAt) {
    return res.status(404).json({ error: "invalid_code" })
  }
  // Clearing codeHash is the claim. Conditioning on it means two browsers
  // racing on the same code end up with exactly one session.
  const ip = req.ip ?? null
  const userAgent = req.get("user-agent") ?? null
  const { count } = await prisma.tempSession.updateMany({
    where: { id: row.id, codeHash },
    data: { codeHash: null, claimedAt: new Date(), ip, userAgent },
  })
  if (!count) return res.status(404).json({ error: "invalid_code" })

  req.login({ ...row.user, tempSession: { id: row.id, expiresAt: row.expiresAt } }, (err) => {
    if (err) return res.status(500).json({ error: "login_failed" })
    // So the browser drops the cookie on time as well. Not the enforcement —
    // that's deserializeUser — just no 30-day cookie left on a shared PC.
    req.session.cookie.maxAge = row.expiresAt.getTime() - Date.now()
    prisma.loginEvent.create({ data: { userId: row.userId, ip, userAgent } }).catch(() => {})
    res.json({ ok: true })
  })
})

tempSessionsRouter.use(requireAuth, denyTempSession)

tempSessionsRouter.post("/", async (req, res) => {
  const parsed = z
    .object({
      name: z.string().trim().max(60).optional(),
      minutes: z.number().int().min(5).max(7 * 24 * 60),
    })
    .safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "invalid", issues: parsed.error.issues })

  const code = newTempCode()
  const row = await prisma.tempSession.create({
    data: {
      userId: currentUser(req).id,
      name: parsed.data.name || "Temporary session",
      codeHash: hashToken(normalizeTempCode(code)),
      expiresAt: new Date(Date.now() + parsed.data.minutes * 60_000),
    },
    select: { id: true, name: true, expiresAt: true },
  })
  // Only time the code ever leaves the server.
  res.status(201).json({ ...row, code })
})

tempSessionsRouter.get("/", async (req, res) => {
  const userId = currentUser(req).id
  // Ended sessions stay listed for a week as a record, then are swept here.
  await prisma.tempSession.deleteMany({
    where: { userId, expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
  })
  res.json(
    await prisma.tempSession.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        expiresAt: true,
        claimedAt: true,
        lastSeenAt: true,
        ip: true,
        userAgent: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    })
  )
})

tempSessionsRouter.delete("/:id", async (req, res) => {
  // deleteMany scoped by userId so one user can't end another's session.
  const { count } = await prisma.tempSession.deleteMany({
    where: { id: req.params.id, userId: currentUser(req).id },
  })
  if (!count) return res.status(404).json({ error: "not_found" })
  // Its HTTP requests fail from here on (deserializeUser finds no row), but
  // an open socket never re-authenticates — cut it explicitly.
  getIO()?.in(`temp:${req.params.id}`).disconnectSockets(true)
  res.json({ ok: true })
})
