import { env } from "../env.js"

// The desktop app (apps/desktop) serves its bundled copy of the web app from
// this origin. Only an app on the user's own machine can claim it — no web
// page can — and it signs in with a device token, never a cookie.
export const DESKTOP_ORIGIN = "darkdrive://app"

// One allowlist, two jobs: which origins may call the API cross-origin, and
// which frontends a freshly signed-in user may be sent back to. They are the
// same set by definition — an origin we already trust with the session cookie
// is one we can redirect to — and keeping it single stops the two from
// drifting apart as frontends are added.
export const ALLOWED_ORIGINS: string[] = Array.from(
  new Set(
    // APP_URL is the API itself: the pairing page is served from here, so a
    // tester who signs in mid-pair has to be allowed back to it.
    [
      env.APP_URL,
      env.WEB_URL,
      env.GALLERY_URL,
      DESKTOP_ORIGIN,
      ...(env.ALLOWED_ORIGINS?.split(",") ?? []),
    ]
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
