import "dotenv/config"
import { z } from "zod"

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().url(),
  WEB_URL: z.string().url(),
  // Origin of the DarkGallery frontend, if it's deployed. Trusted for CORS and
  // as a post-login redirect target, same as WEB_URL.
  GALLERY_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(10),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),
  STORAGE_DIR: z.string().default("./storage"),
  MAX_UPLOAD_MB: z.coerce.number().default(2048),
  // Optional — set to `.your-domain.tld` in production so the session cookie
  // is valid across subdomains (e.g. darkdrive.zenux.live + api.darkdrive.zenux.live).
  COOKIE_DOMAIN: z.string().optional(),
  // Extra origins (comma-separated) the API should accept on top of WEB_URL.
  // Handy for staging + prod on the same box, or www + apex variants.
  ALLOWED_ORIGINS: z.string().optional(),
  // Enables POST /api/auth/dev-login, a password-less login-by-email route
  // for local development when you don't want to wire up Google OAuth.
  // Ignored outside NODE_ENV=development regardless of this flag.
  // z.coerce.boolean() is deliberately NOT used here: it's just Boolean(x),
  // so ENABLE_DEV_LOGIN=false would coerce to `true` — only the literal
  // strings "true"/"1" count as enabled, everything else (including "false")
  // is disabled.
  ENABLE_DEV_LOGIN: z
    .preprocess((v) => v === "true" || v === "1", z.boolean())
    .default(false),
  // From https://my.telegram.org/apps — identifies this app to Telegram, not
  // any individual user. Optional: the Telegram import feature (routes/
  // telegram.ts) 400s with a clear error if these aren't set, rather than
  // being a hard requirement for every deployment.
  TELEGRAM_API_ID: z.coerce.number().optional(),
  TELEGRAM_API_HASH: z.string().optional(),
  // From @BotFather. Optional, on top of the two above — enables the
  // forward-to-bot import instead of (or alongside) the Saved-Messages pull.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
})

export const env = schema.parse(process.env)
export type Env = z.infer<typeof schema>
