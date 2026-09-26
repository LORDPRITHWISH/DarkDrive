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

// Pairing page. The sync client can't do a browser OAuth dance, so it prints
// this URL; the user opens it in the browser they're already signed into and
// copies the token back. Served as HTML from the API origin so the fetch below
// is same-origin (session cookie flows, no CORS entry needed) — same
// inline-page approach as the API root in index.ts.
//
// Two ways in. The mobile app, and anyone pairing by hand, gets a token to
// copy. The desktop app passes ?port=&state= and gets a one-click "Allow"
// instead: the browser is sent back to the app's loopback listener with a
// one-time code, which the app trades for a token at /claim (the RFC 8252
// native-app pattern).
//
// A signed-out browser gets sent through Google and back here, rather than a
// 401 body — this link is opened straight from the app on a fresh phone, where
// no session exists yet.
devicesRouter.get(
  "/pair",
  (req, res, next) => {
    if (req.user) return next()
    // originalUrl, so the desktop app's ?port=&state= survive the Google trip.
    const back = new URL(req.originalUrl, env.APP_URL).toString()
    res.redirect(`/api/auth/google?return=${encodeURIComponent(back)}`)
  },
  (req, res) => {
    const user = currentUser(req)
    const q = z
      .object({
        port: z.coerce.number().int().min(1024).max(65535),
        state: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
        name: z.string().trim().min(1).max(60).catch("Computer"),
      })
      .safeParse(req.query)
    const nonce = res.locals.cspNonce as string
    if (q.success) return res.type("html").send(allowPage(user.email, q.data, nonce))
    res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Pair a device · DarkDrive</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100svh;display:grid;place-items:center;
    font:15px/1.5 system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5}
  .card{width:min(560px,92vw);padding:32px 36px;border:1px solid #262626;
    border-radius:16px;background:#111;box-shadow:0 20px 60px -20px rgba(0,0,0,.6)}
  h1{margin:0 0 4px;font-size:20px;font-weight:600}
  p{margin:0 0 16px;color:#a3a3a3;font-size:13px}
  input,button{font:inherit;border-radius:8px;border:1px solid #333;padding:9px 12px}
  input{background:#0a0a0a;color:#e5e5e5;width:100%;box-sizing:border-box}
  button{background:#e5e5e5;color:#0a0a0a;border:0;font-weight:600;cursor:pointer;margin-top:12px}
  pre{white-space:pre-wrap;word-break:break-all;background:#1f1f1f;padding:12px;
    border-radius:8px;font-size:13px;margin:16px 0 0}
  .warn{color:#fbbf24;font-size:12px;margin-top:8px}
</style></head>
<body><div class="card">
  <h1>Pair a device</h1>
  <p>Signed in as ${user.email}. Name the device, then paste the token into the DarkDrive sync client.</p>
  <input id="name" placeholder="e.g. Laptop" autofocus>
  <button id="go">Create token</button>
  <div id="out"></div>
<script nonce="${nonce}">
const out = document.getElementById("out")
document.getElementById("go").onclick = async () => {
  const name = document.getElementById("name").value.trim() || "Device"
  const r = await fetch("/api/devices", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  })
  const j = await r.json()
  if (!r.ok) {
    out.innerHTML = '<div class="warn">' + (j.error || "failed") + '</div>'
    return
  }
  out.innerHTML = '<pre id="tok"></pre><button id="copy">Copy token</button><div class="warn">Shown once. Copy it now.</div>'
  document.getElementById("tok").textContent = j.token
  document.getElementById("copy").onclick = async () => {
    await navigator.clipboard.writeText(j.token)
    const btn = document.getElementById("copy")
    btn.textContent = "Copied"
    setTimeout(() => { btn.textContent = "Copy token" }, 1500)
  }
}
</script>
</div></body></html>`)
  }
)

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

// The "Allow" button on the loopback pairing page. Returns a code rather than
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

/** Consent page for the desktop app's browser sign-in. */
function allowPage(
  email: string,
  p: { port: number; state: string; name: string },
  nonce: string
) {
  // Everything user-supplied reaches the page as JSON inside the script and is
  // shown via textContent; "<" escaped so a name can't close the tag.
  const data = JSON.stringify({ ...p, email }).replace(/</g, "\\u003c")
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Sign in · DarkDrive</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100svh;display:grid;place-items:center;
    font:15px/1.5 system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5}
  .card{width:min(440px,92vw);padding:32px 36px;border:1px solid #262626;
    border-radius:16px;background:#111;box-shadow:0 20px 60px -20px rgba(0,0,0,.6);text-align:center}
  h1{margin:0 0 8px;font-size:20px;font-weight:600}
  p{margin:0 0 20px;color:#a3a3a3;font-size:14px}
  b{color:#e5e5e5;font-weight:600}
  button{font:inherit;border-radius:8px;padding:10px 28px;background:#e5e5e5;color:#0a0a0a;
    border:0;font-weight:600;cursor:pointer}
  button:disabled{opacity:.5}
  .warn{color:#fbbf24;font-size:13px;margin-top:12px}
</style></head>
<body><div class="card">
  <h1>Sign in to DarkDrive</h1>
  <p>Let the DarkDrive app on <b id="name"></b> sync the files of <b id="email"></b>?</p>
  <button id="go" autofocus>Allow</button>
  <div id="out" class="warn"></div>
<script nonce="${nonce}">
const d = ${data}
document.getElementById("name").textContent = d.name
document.getElementById("email").textContent = d.email
const go = document.getElementById("go")
go.onclick = async () => {
  go.disabled = true
  const r = await fetch("/api/devices/pair-code", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: d.name }),
  })
  if (!r.ok) { go.disabled = false; document.getElementById("out").textContent = "Something went wrong. Try again."; return }
  const { code } = await r.json()
  location.href = "http://127.0.0.1:" + d.port + "/callback?" + new URLSearchParams({ code, state: d.state })
}
</script>
</div></body></html>`
}
