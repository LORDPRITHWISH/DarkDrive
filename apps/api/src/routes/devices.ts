import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { newToken } from "../auth/deviceToken.js"

export const devicesRouter = Router()

// Pairing page. The sync client can't do a browser OAuth dance, so it prints
// this URL; the user opens it in the browser they're already signed into and
// copies the token back. Served as HTML from the API origin so the fetch below
// is same-origin (session cookie flows, no CORS entry needed) — same
// inline-page approach as the API root in index.ts.
//
// ponytail: manual copy/paste. Swap for an OAuth-style device-code flow
// (client polls for approval) if pairing ever needs to be one-click.
devicesRouter.get("/pair", requireAuth, (req, res) => {
  const user = currentUser(req)
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
<script>
const out = document.getElementById("out")
document.getElementById("go").onclick = async () => {
  const name = document.getElementById("name").value.trim() || "Device"
  const r = await fetch("/api/devices", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  })
  const j = await r.json()
  out.innerHTML = r.ok
    ? '<pre>' + j.token + '</pre><div class="warn">Shown once. Copy it now.</div>'
    : '<div class="warn">' + (j.error || "failed") + '</div>'
}
</script>
</div></body></html>`)
})

devicesRouter.use(requireAuth)

devicesRouter.post("/", async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body)
  const user = currentUser(req)
  const { raw, hash } = newToken()
  const device = await prisma.deviceToken.create({
    data: { userId: user.id, name, tokenHash: hash },
    select: { id: true, name: true, createdAt: true },
  })
  // Only time the plaintext ever leaves the server.
  res.status(201).json({ ...device, token: raw })
})

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
