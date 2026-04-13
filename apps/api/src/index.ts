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
import { initSocket } from "./realtime/socket.js"

const app = express()

app.set("trust proxy", 1)
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }))
app.use(cors({ origin: env.WEB_URL, credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: "1mb" }))
app.use(sessionMiddleware)
app.use(passport.initialize())
app.use(passport.session())

app.get("/api/health", (_req, res) => res.json({ ok: true }))
app.use("/api/auth", authRouter)
app.use("/api/folders", foldersRouter)
app.use("/api/files", filesRouter)
app.use("/api/shares", sharesRouter)
app.use("/api/spaces", spacesRouter)

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
