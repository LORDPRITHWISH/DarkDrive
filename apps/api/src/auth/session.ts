import session from "express-session"
import RedisStore from "connect-redis"
import { redis } from "../db/redis.js"
import { env } from "../env.js"

export const sessionMiddleware = session({
  store: new RedisStore({ client: redis, prefix: "dd:sess:" }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: "dd.sid",
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  },
})
