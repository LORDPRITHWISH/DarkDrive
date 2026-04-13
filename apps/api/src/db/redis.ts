import Redis from "ioredis"
import { env } from "../env.js"

const R = Redis as unknown as { new (url: string, opts?: any): any }

export const redis = new R(env.REDIS_URL, { lazyConnect: false })
export const redisPub = new R(env.REDIS_URL, { lazyConnect: false })
export const redisSub = new R(env.REDIS_URL, { lazyConnect: false })

redis.on("error", (err: Error) => console.error("[redis]", err.message))
