import { env } from "../env.js"

// One allowlist, two jobs: which origins may call the API cross-origin, and
// which frontends a freshly signed-in user may be sent back to. They are the
// same set by definition — an origin we already trust with the session cookie
// is one we can redirect to — and keeping it single stops the two from
// drifting apart as frontends are added.
export const ALLOWED_ORIGINS: string[] = Array.from(
  new Set(
    [env.WEB_URL, env.GALLERY_URL, ...(env.ALLOWED_ORIGINS?.split(",") ?? [])]
      .map((s) => s?.trim().replace(/\/+$/, ""))
      .filter((s): s is string => !!s)
  )
)

/**
 * Validates a caller-supplied post-login destination. Returns null for
 * anything not on the allowlist, which is what keeps `?return=` from being an
 * open redirect — the value survives a round trip through Google as the OAuth
 * `state` parameter, so it is untrusted on the way back in.
 */
export function safeReturnUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null
  try {
    const url = new URL(raw)
    return ALLOWED_ORIGINS.includes(url.origin) ? url.toString() : null
  } catch {
    return null
  }
}
