import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { getFolderWithAccess, assertUserPhotosRootId } from "../lib/access.js"
import { getIO } from "../realtime/socket.js"
import {
  awaitCodeSent,
  awaitLoginStep,
  createBotLinkCode,
  getBotUsername,
  importsInFlight,
  pendingLogins,
  
  runTelegramImport,
  startTelegramLogin,
} from "../lib/telegram.js"

export const telegramRouter = Router()
telegramRouter.use(requireAuth)

// Every handler below talks to Telegram's servers, which can fail in far
// more ways than a normal DB-backed route — a bare `async (req,res)=>{}`
// here would leave the request hanging on a rejection instead of reaching a
// response, so each one catches and replies itself.
function fail(res: import("express").Response, err: any) {
  if (err?.name === "ZodError") return res.status(400).json({ error: "invalid", issues: err.issues })
  console.error("[telegram]", err)
  res.status(err?.status || 500).json({ error: err?.errorMessage || err?.message || "internal" })
}

telegramRouter.get("/status", async (req, res) => {
  try {
    const user = currentUser(req)
    const [session, botLink] = await Promise.all([
      prisma.telegramSession.findUnique({ where: { userId: user.id } }),
      prisma.telegramBotLink.findUnique({ where: { userId: user.id } }),
    ])
    res.json({
      linked: !!session,
      phone: session?.phone ?? null,
      pendingLogin: pendingLogins.has(user.id),
      importing: importsInFlight.has(user.id),
      bot: { username: getBotUsername(), linked: !!botLink },
    })
  } catch (err) {
    fail(res, err)
  }
})

telegramRouter.post("/login/start", async (req, res) => {
  try {
    const user = currentUser(req)
    const { phone } = z.object({ phone: z.string().trim().regex(/^\+?[0-9]{5,15}$/) }).parse(req.body)

    const existing = pendingLogins.get(user.id)
    if (existing) existing.client.disconnect().catch(() => {})
    pendingLogins.delete(user.id)

    // Waits for Telegram to actually send the code, so PHONE_NUMBER_INVALID
    // / FLOOD_WAIT answer this request instead of leaving the client on a
    // code screen for a code that is never coming.
    await awaitCodeSent(startTelegramLogin(user.id, phone))
    res.status(201).json({ ok: true })
  } catch (err) {
    fail(res, err)
  }
})

telegramRouter.post("/login/verify", async (req, res) => {
  try {
    const user = currentUser(req)
    const pending = pendingLogins.get(user.id)
    if (!pending) return res.status(400).json({ error: "no_pending_login" })

    const body = z
      .object({ code: z.string().trim().min(1).max(10).optional(), password: z.string().min(1).max(255).optional() })
      .parse(req.body)

    if (body.code !== undefined) {
      if (!pending.resolveCode) return res.status(409).json({ error: "not_ready" })
      pending.resolveCode(body.code)
    } else if (body.password !== undefined) {
      if (!pending.resolvePassword) return res.status(409).json({ error: "not_ready" })
      pending.resolvePassword(body.password)
    } else {
      return res.status(400).json({ error: "code_or_password_required" })
    }

    const outcome = await awaitLoginStep(pending)
    if (outcome.type === "password_required") {
      return res.status(401).json({ error: "password_required" })
    }
    // Login attempt is over either way — success or failure both retire this
    // connection; a retry goes through /login/start again.
    pending.client.disconnect().catch(() => {})
    pendingLogins.delete(user.id)

    if (outcome.type === "error") {
      const msg = (outcome.err as any)?.errorMessage || (outcome.err as any)?.message || "login_failed"
      return res.status(400).json({ error: msg })
    }
    res.json({ ok: true, linked: true })
  } catch (err) {
    fail(res, err)
  }
})

telegramRouter.delete("/session", async (req, res) => {
  try {
    const user = currentUser(req)
    await prisma.telegramSession.deleteMany({ where: { userId: user.id } })
    res.json({ ok: true })
  } catch (err) {
    fail(res, err)
  }
})

telegramRouter.post("/import", async (req, res) => {
  try {
    const user = currentUser(req)
    const { folderId } = z.object({ folderId: z.string().optional() }).parse(req.body)

    if (importsInFlight.has(user.id)) return res.status(429).json({ error: "already_importing" })
    const linked = await prisma.telegramSession.findUnique({ where: { userId: user.id } })
    if (!linked) return res.status(400).json({ error: "not_linked" })

    const targetFolderId = folderId
      ? (await getFolderWithAccess(user.id, folderId, "write"))?.id
      : await assertUserPhotosRootId(user)
    if (!targetFolderId) return res.status(403).json({ error: "forbidden" })

    const used = await prisma.file.aggregate({
      _sum: { size: true },
      where: { ownerId: user.id, isTrashed: false },
    })
    const quota = user.storageQuotaBytes ?? BigInt(0)
    const startUsedBytes = BigInt(used._sum.size ?? BigInt(0))
    if (startUsedBytes >= quota) return res.status(413).json({ error: "quota_exceeded" })

    importsInFlight.add(user.id)
    res.status(202).json({ ok: true, started: true })

    runTelegramImport(user.id, linked.session, targetFolderId, quota, startUsedBytes)
      .then((progress) => {
        getIO()?.to(`user:${user.id}`).emit("telegram:import:done", progress)
      })
      .catch((err) => {
        console.error("[telegram import] aborted:", err)
        getIO()?.to(`user:${user.id}`).emit("telegram:import:error", {
          error: err?.errorMessage || err?.message || "import_failed",
        })
      })
      .finally(() => importsInFlight.delete(user.id))
  } catch (err) {
    fail(res, err)
  }
})

// One-time code the user pastes into the bot as "/start <code>" (or opens
// via the returned deep link) to link their Telegram chat to this account.
telegramRouter.post("/bot/link-code", async (req, res) => {
  try {
    const user = currentUser(req)
    const username = getBotUsername()
    if (!username) return res.status(400).json({ error: "telegram_bot_not_configured" })
    const code = createBotLinkCode(user.id)
    res.status(201).json({ code, deepLink: `https://t.me/${username}?start=${code}` })
  } catch (err) {
    fail(res, err)
  }
})

telegramRouter.delete("/bot/link", async (req, res) => {
  try {
    const user = currentUser(req)
    await prisma.telegramBotLink.deleteMany({ where: { userId: user.id } })
    res.json({ ok: true })
  } catch (err) {
    fail(res, err)
  }
})
