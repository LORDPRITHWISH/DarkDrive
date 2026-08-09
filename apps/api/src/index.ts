import "./lib/logbuf.js" // patches console — must load before anything that logs
import http from "node:http"
import express from "express"
import cors from "cors"
import helmet from "helmet"
import cookieParser from "cookie-parser"
import { env } from "./env.js"
import { sessionMiddleware } from "./auth/session.js"
import { passport } from "./auth/passport.js"
import { authRouter } from "./routes/auth.js"
import { foldersRouter } from "./routes/folders.js"
import { filesRouter } from "./routes/files.js"
import { sharesRouter } from "./routes/shares.js"
import { spacesRouter } from "./routes/spaces.js"
import { meRouter } from "./routes/me.js"
import { adminRouter } from "./routes/admin.js"
import { searchRouter } from "./routes/search.js"
import { notificationsRouter } from "./routes/notifications.js"
import { initSocket } from "./realtime/socket.js"

const app = express()

app.set("trust proxy", 1)
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }))

// Build the allowlist from WEB_URL + the optional ALLOWED_ORIGINS env var.
// Using a function lets us log rejections — easiest way to debug "CORS broke
// after deploy" scenarios where a trailing slash or stale env slips through.
const ALLOWED_ORIGINS = Array.from(
  new Set(
    [
      env.WEB_URL,
      ...(env.ALLOWED_ORIGINS?.split(",") ?? []),
    ]
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  )
)
console.log("[api] allowed origins:", ALLOWED_ORIGINS)

app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      // Same-origin / server-to-server / curl: no Origin header — allow.
      if (!origin) return cb(null, true)
      const normalized = origin.replace(/\/+$/, "")
      if (ALLOWED_ORIGINS.includes(normalized)) return cb(null, true)
      console.warn("[cors] rejected origin:", origin)
      return cb(new Error(`origin_not_allowed:${origin}`))
    },
  })
)
app.use(cookieParser())
app.use(express.json({ limit: "1mb" }))
app.use(sessionMiddleware)
app.use(passport.initialize())
app.use(passport.session())

// Lightweight reachability marker — browsers that hit the API root get a
// readable page, scripts / curl get a JSON payload. No auth, no DB.
app.get("/", (req, res) => {
  if (req.accepts(["html", "json"]) === "json") {
    return res.json({
      ok: true,
      service: "darkdrive-api",
      uptimeSec: Math.floor(process.uptime()),
      time: new Date().toISOString(),
    })
  }
  res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"><title>DarkDrive API</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100svh;display:grid;place-items:center;
    font:15px/1.5 system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5}
  .card{padding:32px 36px;border:1px solid #262626;border-radius:16px;
    background:#111;box-shadow:0 20px 60px -20px rgba(0,0,0,.6);text-align:center}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;
    background:#10b981;box-shadow:0 0 0 4px rgba(16,185,129,.2);margin-right:8px}
  h1{margin:0 0 4px;font-size:20px;font-weight:600}
  p{margin:0;color:#a3a3a3;font-size:13px}
  code{color:#e5e5e5;background:#1f1f1f;padding:2px 6px;border-radius:6px}
</style></head>
<body><div class="card">
  <div><span class="dot"></span>DarkDrive API is online</div>
  <h1 style="margin-top:12px">Reachable</h1>
  <p>Service up for ${Math.floor(process.uptime())}s · ${new Date().toISOString()}</p>
  <p style="margin-top:10px">Health: <code>/api/health</code></p>
</div></body></html>`)
})

app.get("/api/health", (_req, res) => res.json({ ok: true }))
app.use("/api/auth", authRouter)
app.use("/api/folders", foldersRouter)
app.use("/api/files", filesRouter)
app.use("/api/shares", sharesRouter)
app.use("/api/spaces", spacesRouter)
app.use("/api/me", meRouter)
app.use("/api/admin", adminRouter)
app.use("/api/search", searchRouter)
app.use("/api/notifications", notificationsRouter)

// centralized error handler
app.use((err: any, _req: express.Request, res: express.Response, _n: express.NextFunction) => {
  console.error("[api error]", err)
  if (err?.name === "ZodError") return res.status(400).json({ error: "invalid", issues: err.issues })
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "too_large" })
  res.status(err.status || 500).json({ error: err.message || "internal" })
})

const server = http.createServer(app)
initSocket(server)

server.listen(env.PORT, () => {
  console.log(`[api] listening on ${env.APP_URL} (port ${env.PORT})`)
})
