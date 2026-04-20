import "dotenv/config"
import { z } from "zod"

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().url(),
  WEB_URL: z.string().url(),
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
})

export const env = schema.parse(process.env)
export type Env = z.infer<typeof schema>
