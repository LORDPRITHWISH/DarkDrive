import session from "express-session"
import RedisStore from "connect-redis"
import { redis } from "../db/redis.js"
import { env } from "../env.js"

const isProd = env.NODE_ENV === "production"

export const sessionMiddleware = session({
  store: new RedisStore({ client: redis, prefix: "dd:sess:" }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: "dd.sid",
  cookie: {
    httpOnly: true,
    // In production the web app and the API live on different subdomains, so
    // fetches are cross-origin. `SameSite=None; Secure` (over HTTPS) makes the
    // session cookie flow with those credentialed requests; dev stays on lax.
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    domain: env.COOKIE_DOMAIN,
    maxAge: 1000 * 60 * 60 * 24 * 30,
  },
})
