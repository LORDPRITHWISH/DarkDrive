import fs from "node:fs"
import crypto from "node:crypto"
import mime from "mime-types"
import { nanoid } from "nanoid"
import { Api, TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"
import { NewMessage, type NewMessageEvent } from "telegram/events/index.js"
import { env } from "../env.js"
import { prisma } from "../db/prisma.js"
import { ensureDirFor, newStorageKey } from "../storage/local.js"
import { queueThumbnail } from "./thumbnails.js"
import { getIO } from "../realtime/socket.js"
import { assertUserPhotosRootId } from "./access.js"
import { logActivity } from "./activity.js"

export function requireTelegramCreds() {
  if (!env.TELEGRAM_API_ID || !env.TELEGRAM_API_HASH)
    throw Object.assign(new Error("telegram_not_configured"), { status: 400 })
  return { apiId: env.TELEGRAM_API_ID, apiHash: env.TELEGRAM_API_HASH }
}

// Every event this integration produces goes through here. console.* is
// captured by lib/logbuf, so these lines are what the admin Telegram panel
// (Admin -> Activity) shows: who sent what, what landed where, and why
// anything didn't. Structured as JSON so the panel's substring filter can
// pick out a chat id or a filename.
function tlog(event: string, data?: Record<string, unknown>) {
  console.log(`[telegram] ${event}`, data ? JSON.stringify(data) : "")
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export type PendingLogin = {
  client: TelegramClient
  phone: string
  createdAt: number
  resolveCode?: (code: string) => void
  rejectCode?: (err: unknown) => void
  resolvePassword?: (password: string) => void
  rejectPassword?: (err: unknown) => void
  // Resolves when gramjs actually asks for the code, i.e. Telegram accepted
  // the number and sent one. /login/start waits on this so a bad number or a
  // flood-wait fails there instead of silently at verify time.
  codeRequested: ReturnType<typeof deferred<void>>
  passwordNeeded: ReturnType<typeof deferred<void>>
  /** passwordNeeded is one-shot; this records that it has already fired. */
  passwordAsked: boolean
  done: Promise<void>
}

// Keyed by userId — only one login attempt in flight per user. Entries are
// cleaned up on success/failure and by the TTL sweep below if a user
// abandons the flow (never submits a code).
export const pendingLogins = new Map<string, PendingLogin>()
const LOGIN_TTL_MS = 10 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [userId, p] of pendingLogins) {
    if (now - p.createdAt > LOGIN_TTL_MS) {
      p.client.disconnect().catch(() => {})
      pendingLogins.delete(userId)
    }
  }
}, 60 * 1000).unref()

// Starts a Telegram login for `phone`, driven by TelegramClient's own
// start() flow (it already handles SendCode/SignIn/CheckPassword and
// FLOOD_WAIT for us) instead of reimplementing that RPC dance by hand.
// phoneCode()/password() are only called once the corresponding step is
// actually reached, which is what lets /login/verify be called twice —
// once with the SMS code, and again with the 2FA password if needed.
export function startTelegramLogin(userId: string, phone: string): PendingLogin {
  const { apiId, apiHash } = requireTelegramCreds()
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  })

  const pending: PendingLogin = {
    client,
    phone,
    createdAt: Date.now(),
    codeRequested: deferred<void>(),
    passwordNeeded: deferred<void>(),
    passwordAsked: false,
    done: Promise.resolve(),
  }

  pending.done = client
    .start({
      phoneNumber: async () => phone,
      phoneCode: () =>
        new Promise<string>((resolve, reject) => {
          pending.resolveCode = resolve
          pending.rejectCode = reject
          pending.codeRequested.resolve()
        }),
      password: () => {
        pending.passwordAsked = true
        pending.passwordNeeded.resolve()
        return new Promise<string>((resolve, reject) => {
          pending.resolvePassword = resolve
          pending.rejectPassword = reject
        })
      },
      onError: (err) => {
        throw err
      },
    })
    .then(async () => {
      const session = client.session.save() as unknown as string
      await prisma.telegramSession.upsert({
        where: { userId },
        update: { session, phone },
        create: { userId, session, phone },
      })
    })

  // Nothing awaits `done` between /login/start and /login/verify, so a
  // failure in that window (PHONE_NUMBER_INVALID, FLOOD_WAIT, a login the
  // user walks away from) is an unhandled rejection — process-fatal on Node.
  // awaitCodeSent/awaitLoginStep still see the error; this only sinks it and
  // retires the dead attempt.
  pending.done.catch(() => {
    if (pendingLogins.get(userId) === pending) pendingLogins.delete(userId)
    client.disconnect().catch(() => {})
  })

  pendingLogins.set(userId, pending)
  return pending
}

// Resolves once Telegram has actually sent the code, rejects with its own
// error if it never gets that far.
export function awaitCodeSent(pending: PendingLogin): Promise<void> {
  return Promise.race([pending.codeRequested.promise, pending.done])
}

// Races "login finished" against "a password prompt just appeared" so the
// route handler can tell the client which of the two happened without
// polling.
export async function awaitLoginStep(
  pending: PendingLogin
): Promise<{ type: "success" } | { type: "password_required" } | { type: "error"; err: unknown }> {
  const settled = pending.done
    .then(() => ({ type: "success" as const }))
    .catch((err) => ({ type: "error" as const, err }))
  // passwordNeeded stays resolved once it fires, so racing it again on the
  // call that carries the password would answer "password_required" forever
  // and a 2FA account could never finish linking.
  if (pending.passwordAsked) return settled
  return Promise.race([
    settled,
    pending.passwordNeeded.promise.then(() => ({ type: "password_required" as const })),
  ])
}

// Per-user guard so a second /import call while one is already running is
// rejected instead of racing the same account's quota/session.
export const importsInFlight = new Set<string>()

const KNOWN_EXT: Record<string, string> = { "image/jpeg": "jpg" }

type TgDoc = { mimeType?: string; attributes?: { fileName?: string }[] }

function fromDocument(id: number, doc: TgDoc, fallbackMime: string) {
  const mimeType = doc.mimeType || fallbackMime
  const attrName = doc.attributes?.find((a) => a.fileName)?.fileName
  const ext = KNOWN_EXT[mimeType] ?? mime.extension(mimeType) ?? "bin"
  return { name: attrName || `telegram-${id}.${ext}`, mimeType }
}

// Pure — no network — so it's covered by telegram.test.ts. Telegram photos
// never carry a filename; videos usually do (DocumentAttributeFilename), but
// forwarded/self-destructing ones sometimes don't, hence the fallback.
//
// `document` is the case that matters for big files: a video sent with "send
// as file" (how people avoid Telegram recompressing a 1-2GB upload) arrives
// with no DocumentAttributeVideo, so `message.video` is undefined and only
// the raw document is left to go on. Matched on mime so the same branch
// doesn't drag in PDFs/archives/audio.
export function resolveMediaMeta(message: {
  id: number
  photo?: unknown
  video?: TgDoc
  document?: TgDoc
}): { name: string; mimeType: string } | null {
  if (message.photo) return { name: `telegram-${message.id}.jpg`, mimeType: "image/jpeg" }
  if (message.video) return fromDocument(message.id, message.video, "video/mp4")
  if (message.document?.mimeType && /^(video|image)\//.test(message.document.mimeType))
    return fromDocument(message.id, message.document, "video/mp4")
  return null
}

// Hashed by streaming, not readFileSync: these files run to gigabytes, and
// buffering one whole into memory just to hash it would spike RSS by the
// file's full size (Node won't even error — it would just eat the RAM).
function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256")
    fs.createReadStream(path)
      .on("data", (c) => hash.update(c))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")))
  })
}

type SaveResult =
  | { status: "imported"; size: number; fileId: string }
  | { status: "skipped_quota" }
  | { status: "already_imported"; fileId?: string }
  | { status: "unsupported" }
  | { status: "failed"; err: unknown }

// Downloads one message's media and lands it as a File, the same way
// /files/import-url lands a URL: quota-checked, sha256'd, thumbnail queued.
// Shared by the bulk Saved-Messages import below and the bot's per-message
// handler — same landing logic either way, just different message sources.
async function saveTelegramMedia(
  client: TelegramClient,
  message: Api.Message,
  userId: string,
  folderId: string,
  quotaBytes: bigint,
  usedBytes: bigint,
  telegramRef: string,
  onBytes?: (downloaded: number, total: number) => void
): Promise<SaveResult> {
  const meta = resolveMediaMeta(message as unknown as Parameters<typeof resolveMediaMeta>[0])
  if (!meta) return { status: "unsupported" }

  // Before the download, not after: the whole point is to not re-pull
  // gigabytes that a previous (interrupted) run already landed.
  const already = await prisma.file.findFirst({
    where: { ownerId: userId, telegramRef },
    select: { id: true },
  })
  if (already) return { status: "already_imported", fileId: already.id }

  if (usedBytes >= quotaBytes) return { status: "skipped_quota" }

  // Reject on the declared size before spending minutes downloading — the
  // post-download check below still stands as the authoritative one.
  const declared = Number((message.document?.size ?? 0).toString())
  if (declared > 0 && usedBytes + BigInt(declared) > quotaBytes)
    return { status: "skipped_quota" }

  const key = newStorageKey(meta.name)
  const dest = ensureDirFor(key)
  try {
    await client.downloadMedia(message, {
      outputFile: dest,
      progressCallback: onBytes
        ? (downloaded, total) => onBytes(Number(downloaded.toString()), Number(total.toString()))
        : undefined,
    })
    const stat = fs.statSync(dest)
    if (usedBytes + BigInt(stat.size) > quotaBytes) {
      fs.unlinkSync(dest)
      return { status: "skipped_quota" }
    }
    const sha256 = await hashFile(dest)
    const file = await prisma.file.create({
      data: {
        name: meta.name,
        folderId,
        ownerId: userId,
        size: BigInt(stat.size),
        mimeType: meta.mimeType,
        storageKey: key,
        sha256,
        telegramRef,
        takenAt: message.date ? new Date(message.date * 1000) : null,
      },
    })
    queueThumbnail(file.id)
    return { status: "imported", size: stat.size, fileId: file.id }
  } catch (err) {
    try {
      fs.unlinkSync(dest)
    } catch {}
    // The findFirst above is a fast path, not a lock — two runs racing the
    // same message both pass it and one loses here on the unique index.
    // That's the constraint doing its job, not a failure worth reporting.
    if ((err as { code?: string })?.code === "P2002") return { status: "already_imported" }
    return { status: "failed", err }
  }
}

export type ImportProgress = {
  imported: number
  skipped: number
  /** Already present from an earlier run — the resume path, not an error. */
  alreadyImported: number
  failed: number
  /**
   * Upper bound, not an exact count: the two message filters overlap on
   * ordinary videos and non-media documents get dropped later, so the real
   * figure is only known once the walk finishes.
   */
  total: number | null
  // What's downloading right now. A single 2GB file can take many minutes,
  // so without this the UI looks frozen between per-file counter bumps.
  current: { name: string; downloaded: number; total: number } | null
}

// Throttle byte-level progress the same way lib/urlImport does — the
// download pushes far faster than a socket event is worth emitting.
const PROGRESS_INTERVAL_MS = 250

// Pulls every photo/video out of the user's Saved Messages ("me") into
// `folderId`, emitting progress over the same user-room socket convention as
// /files/import-url and /files/:id/extract. Runs until the chat is exhausted,
// the owner's quota is used up, or a flood-wait exceeds gramjs's own retry
// budget (it retries smaller waits on its own — see connectionRetries above).
export async function runTelegramImport(
  userId: string,
  session: string,
  folderId: string,
  quotaBytes: bigint,
  startUsedBytes: bigint
): Promise<ImportProgress> {
  const { apiId, apiHash } = requireTelegramCreds()
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5,
  })
  const progress: ImportProgress = {
    imported: 0,
    skipped: 0,
    alreadyImported: 0,
    failed: 0,
    total: null,
    current: null,
  }
  let usedBytes = startUsedBytes
  const emit = () => getIO()?.to(`user:${userId}`).emit("telegram:import:progress", progress)

  try {
    await client.connect()

    // Two filters, not one: PhotoVideo misses a video sent with "send as
    // file" (no DocumentAttributeVideo), which is exactly how large videos
    // are usually uploaded. Document catches those — plus PDFs/archives,
    // which resolveMediaMeta then drops on mime. The two overlap on ordinary
    // videos, hence the seen-id dedupe.
    const filters = [new Api.InputMessagesFilterPhotoVideo(), new Api.InputMessagesFilterDocument()]

    const counts = await Promise.all(
      filters.map(async (filter) => {
        const page = await client.getMessages("me", { limit: 1, filter })
        return (page as unknown as { total?: number }).total ?? 0
      })
    )
    progress.total = counts.reduce((a, b) => a + b, 0) || null
    tlog("saved-messages import start", { userId, folderId, total: progress.total })

    const seen = new Set<number>()
    for (const filter of filters) {
      for await (const message of client.iterMessages("me", { filter })) {
        if (seen.has(message.id)) continue
        seen.add(message.id)

        let lastTick = 0
        let loggedPct = -1
        const startedAt = Date.now()
        const name = message.file?.name ?? "file"
        const result = await saveTelegramMedia(
          client,
          message,
          userId,
          folderId,
          quotaBytes,
          usedBytes,
          `me:${message.id}`,
          (downloaded, total) => {
            const now = Date.now()
            if (now - lastTick < PROGRESS_INTERVAL_MS) return
            lastTick = now
            progress.current = { name, downloaded, total }
            emit()
            // Console gets one line per 10%, not per 250ms tick — the log ring
            // the admin panel reads is 2000 lines for the whole process.
            const pct = total > 0 ? Math.floor((downloaded / total) * 100) : 0
            if (pct >= loggedPct + 10) {
              loggedPct = pct
              tlog("saved-messages download", { userId, messageId: message.id, name, pct, downloaded, total })
            }
          }
        )
        progress.current = null

        if (result.status === "unsupported") continue
        if (result.status === "imported") {
          usedBytes += BigInt(result.size)
          progress.imported++
          await logActivity({
            userId,
            fileId: result.fileId,
            action: "upload",
            detail: {
              source: "telegram-saved-messages",
              messageId: message.id,
              name,
              size: result.size,
            },
          })
        } else if (result.status === "already_imported") {
          progress.alreadyImported++
        } else if (result.status === "skipped_quota") {
          progress.skipped++
        } else {
          console.error("[telegram import] failed on message", message.id, result.err)
          progress.failed++
        }
        tlog("saved-messages item", {
          userId,
          messageId: message.id,
          name,
          status: result.status,
          size: result.status === "imported" ? result.size : undefined,
          ms: Date.now() - startedAt,
        })
        emit()
      }
    }
  } finally {
    progress.current = null
    emit()
    tlog("saved-messages import finished", { userId, ...progress, current: undefined })
    await client.disconnect().catch(() => {})
  }

  return progress
}

// --- forward-to-bot import ---------------------------------------------
// A second way in, alongside the Saved-Messages pull above: run a bot
// (token from @BotFather) that imports whatever a linked chat sends it, in
// real time. Still authenticates via gramjs/MTProto — same `telegram`
// dependency, same downloadMedia path with no Bot-API 20MB file cap.

type PendingBotLink = { userId: string; expiresAt: number }
const BOT_LINK_TTL_MS = 10 * 60 * 1000
const botLinkCodes = new Map<string, PendingBotLink>()

setInterval(() => {
  const now = Date.now()
  for (const [code, p] of botLinkCodes) if (p.expiresAt < now) botLinkCodes.delete(code)
}, 60 * 1000).unref()

// Short code a user pastes into the bot as "/start <code>" to link their
// chat — same one-time-code shape as the login flow above, just for a
// different handshake (Telegram's own /start deep-link mechanism).
export function createBotLinkCode(userId: string): string {
  const code = nanoid(10)
  botLinkCodes.set(code, { userId, expiresAt: Date.now() + BOT_LINK_TTL_MS })
  return code
}

let botClient: TelegramClient | null = null
let botUsername: string | null = null

export function getBotUsername(): string | null {
  return botUsername
}

// Declared size, straight off the message — known before a byte is
// downloaded, so it can go in the log line that starts the download.
function mediaSize(message: Api.Message): number {
  const raw = message.file?.size ?? message.document?.size
  return raw ? Number(raw.toString()) : 0
}

export function resultText(status: SaveResult["status"], name: string, link?: string): string {
  const tail = link ? `\n${link}` : ""
  switch (status) {
    case "imported":
      return `Saved \u2713 ${name}\nIt's in My Photos on DarkDrive.${tail}`
    case "already_imported":
      return `Already saved \u2713 ${name}${tail}`
    case "skipped_quota":
      return "Skipped \u2014 you're out of storage."
    case "unsupported":
      return "I can only save photos and videos."
    default:
      return "Couldn't save that one, sorry."
  }
}

// The "Downloading..." ack becomes the result, rather than piling a second
// message on top of it. Editing can fail (message deleted, too old), so a
// plain send is the fallback.
async function replaceStatus(
  client: TelegramClient,
  chatId: Api.Message["chatId"],
  statusId: number | undefined,
  text: string
) {
  if (statusId !== undefined) {
    try {
      await client.editMessage(chatId!, { message: statusId, text })
      return
    } catch {}
  }
  await client.sendMessage(chatId!, { message: text })
}

// Anything that isn't media gets an answer. The bot used to ignore text
// completely, which made it look dead to anyone who said hello to it.
export async function replyForText(
  text: string,
  user: { id: string; email: string; storageQuotaBytes: bigint | null },
  photosUrl: string
): Promise<string> {
  if (text.startsWith("/status")) {
    const [used, imported] = await Promise.all([
      prisma.file.aggregate({ _sum: { size: true }, where: { ownerId: user.id, isTrashed: false } }),
      prisma.file.count({ where: { ownerId: user.id, telegramRef: { not: null } } }),
    ])
    const gb = (n: bigint) => (Number(n) / 1024 ** 3).toFixed(2)
    return [
      `Linked to ${user.email}`,
      `${imported} file${imported === 1 ? "" : "s"} imported from Telegram`,
      `${gb(BigInt(used._sum.size ?? BigInt(0)))} GB of ${gb(user.storageQuotaBytes ?? BigInt(0))} GB used`,
      "",
      photosUrl,
    ].join("\n")
  }
  return [
    "Send or forward a photo or video here and I'll save it straight to your DarkDrive Photos.",
    "",
    "/status \u2014 what's linked and how much storage you have left",
    "/help \u2014 this message",
    "",
    `Your photos: ${photosUrl}`,
  ].join("\n")
}

async function handleBotMessage(event: NewMessageEvent) {
  const client = botClient
  const message = event.message
  if (!client || !message?.chatId) return
  const chatId = message.chatId.toString()
  const text = message.message?.trim() ?? ""
  const media = resolveMediaMeta(message as unknown as Parameters<typeof resolveMediaMeta>[0])

  tlog("bot message", {
    chatId,
    messageId: message.id,
    senderId: message.senderId?.toString(),
    text: text.slice(0, 500) || undefined,
    media: media ? { ...media, size: mediaSize(message) } : undefined,
  })

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1]
    const pending = code ? botLinkCodes.get(code) : undefined
    if (!pending || pending.expiresAt < Date.now()) {
      tlog("bot link rejected", { chatId, code, reason: pending ? "expired" : "unknown_code" })
      await client.sendMessage(message.chatId, {
        message: "That link code is invalid or expired \u2014 grab a fresh one from DarkDrive.",
      })
      return
    }
    botLinkCodes.delete(code!)
    await prisma.telegramBotLink.upsert({
      where: { userId: pending.userId },
      update: { chatId },
      create: { userId: pending.userId, chatId },
    })
    tlog("bot linked", { chatId, userId: pending.userId })
    await client.sendMessage(message.chatId, {
      message: "Linked! Send or forward photos and videos here and they'll land in your DarkDrive Photos.",
    })
    return
  }

  const link = await prisma.telegramBotLink.findUnique({ where: { chatId } })
  if (!link) {
    tlog("bot message from unlinked chat", { chatId })
    await client.sendMessage(message.chatId, {
      message:
        "This chat isn't linked to a DarkDrive account yet \u2014 grab a link code from DarkDrive and send /start <code> here.",
    })
    return
  }

  const user = await prisma.user.findUnique({ where: { id: link.userId } })
  if (!user) {
    tlog("bot link points at a missing user", { chatId, userId: link.userId })
    return
  }
  const room = getIO()?.to(`user:${user.id}`)

  if (!media) {
    // Reads user.photosRootFolderId, only hitting the DB the first time a
    // given account ever needs the folder created.
    const photosUrl = `${env.WEB_URL}/drive/${await assertUserPhotosRootId(user)}`
    const reply = await replyForText(text, user, photosUrl)
    await client.sendMessage(message.chatId, { message: reply })
    tlog("bot replied to text", { chatId, user: user.email, text: text.slice(0, 500) })
    return
  }

  const folderId = await assertUserPhotosRootId(user)
  const used = await prisma.file.aggregate({
    _sum: { size: true },
    where: { ownerId: user.id, isTrashed: false },
  })
  const quota = user.storageQuotaBytes ?? BigInt(0)
  const ref = `${chatId}:${message.id}`
  const startedAt = Date.now()

  tlog("bot download start", {
    chatId,
    messageId: message.id,
    user: user.email,
    name: media.name,
    size: mediaSize(message),
    folderId,
  })
  const status = await client
    .sendMessage(message.chatId, { message: `Downloading ${media.name}\u2026` })
    .catch(() => null)

  let lastTick = 0
  let loggedPct = -1
  const result = await saveTelegramMedia(
    client,
    message,
    user.id,
    folderId,
    quota,
    BigInt(used._sum.size ?? BigInt(0)),
    ref,
    (downloaded, total) => {
      const now = Date.now()
      if (now - lastTick < PROGRESS_INTERVAL_MS) return
      lastTick = now
      // Two audiences: the browser gets every tick (it draws a bar), the log
      // ring gets one line per 10% so a single big file can't flush it.
      room?.emit("telegram:bot:progress", { id: ref, name: media.name, downloaded, total })
      const pct = total > 0 ? Math.floor((downloaded / total) * 100) : 0
      if (pct >= loggedPct + 10) {
        loggedPct = pct
        tlog("bot download progress", { chatId, name: media.name, pct, downloaded, total })
      }
    }
  )

  if (result.status === "imported") {
    await logActivity({
      userId: user.id,
      fileId: result.fileId,
      action: "upload",
      detail: {
        source: "telegram-bot",
        chatId,
        messageId: message.id,
        name: media.name,
        size: result.size,
        caption: text || undefined,
      },
    })
  }
  tlog("bot import result", {
    chatId,
    messageId: message.id,
    user: user.email,
    name: media.name,
    status: result.status,
    size: result.status === "imported" ? result.size : mediaSize(message),
    ms: Date.now() - startedAt,
    error:
      result.status === "failed"
        ? String((result.err as { message?: string })?.message ?? result.err)
        : undefined,
  })

  room?.emit("telegram:bot:received", { id: ref, name: media.name, status: result.status })
  // Straight at the file, not just the folder — /drive/:folderId?file=:id
  // opens the preview (see web pages/Drive.tsx).
  const fileId =
    result.status === "imported" || result.status === "already_imported" ? result.fileId : undefined
  const previewLink = fileId ? `${env.WEB_URL}/drive/${folderId}?file=${fileId}` : undefined
  await replaceStatus(
    client,
    message.chatId,
    status?.id,
    resultText(result.status, media.name, previewLink)
  )
}

// Connects the bot once at server startup (see index.ts) and leaves it
// running for the life of the process — there's exactly one bot account, so
// one long-lived client is simpler than reconnecting per message.
export async function initTelegramBot(): Promise<void> {
  const { apiId, apiHash } = requireTelegramCreds()
  if (!env.TELEGRAM_BOT_TOKEN)
    throw Object.assign(new Error("telegram_bot_not_configured"), { status: 400 })

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  })
  await client.start({ botAuthToken: env.TELEGRAM_BOT_TOKEN })
  const me = await client.getMe()
  botUsername = (me as unknown as { username?: string }).username ?? null
  botClient = client
  // A throw inside a gramjs handler is an unhandled rejection, i.e. a silent
  // death for that message — catch at the one entry point so it lands in the
  // log the admin panel reads instead.
  client.addEventHandler(
    (event) =>
      handleBotMessage(event).catch((err) =>
        console.error("[telegram] bot handler failed:", err)
      ),
    // incoming only: without it the bot's own replies come back as events
    // and it answers itself.
    new NewMessage({ incoming: true })
  )
  tlog("bot connected", { username: botUsername })
}
