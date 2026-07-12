import type { Response } from "express"
import { env } from "../env.js"

const FRAME_ANCESTORS = Array.from(
  new Set(
    [
      "'self'",
      env.WEB_URL,
      ...(env.ALLOWED_ORIGINS?.split(",") ?? []),
    ]
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        if (s === "'self'") return s
        return new URL(s).origin
      })
  )
).join(" ")

export function allowFrameEmbedding(res: Response) {
  res.removeHeader("X-Frame-Options")

  const existing = res.getHeader("Content-Security-Policy")
  const directives =
    typeof existing === "string"
      ? existing
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean)
          .filter((part) => !part.toLowerCase().startsWith("frame-ancestors "))
      : []

  directives.push(`frame-ancestors ${FRAME_ANCESTORS}`)
  res.setHeader("Content-Security-Policy", directives.join("; "))
}
