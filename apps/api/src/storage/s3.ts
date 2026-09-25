import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import type { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3"
import { env } from "../env.js"
import type { StorageDriver } from "./types.js"
import { SCRATCH_ROOT } from "./scratch.js"

if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
  throw new Error(
    "STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY to be set"
  )
}
export const BUCKET = env.S3_BUCKET

export const client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
})

export function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string })?.name
  return name === "NotFound" || name === "NoSuchKey"
}

// Per-operation request counters for the admin S3 panel.
// ponytail: in-memory, reset on restart and per-process — persist to Redis if
// history across restarts or multiple API processes ever matters.
export type OpStats = {
  count: number
  errors: number
  notFound: number
  totalMs: number
  maxMs: number
  bytes: number
  lastError: string | null
  lastAt: number | null
}
export const s3Metrics = {
  since: Date.now(),
  ops: {} as Record<string, OpStats>,
}

async function timed<T>(
  op: string,
  fn: () => Promise<T>,
  bytesOf?: (r: T) => number
): Promise<T> {
  const s = (s3Metrics.ops[op] ??= {
    count: 0,
    errors: 0,
    notFound: 0,
    totalMs: 0,
    maxMs: 0,
    bytes: 0,
    lastError: null,
    lastAt: null,
  })
  const started = Date.now()
  s.count++
  s.lastAt = started
  try {
    const r = await fn()
    if (bytesOf) s.bytes += bytesOf(r)
    return r
  } catch (err) {
    if (isNotFound(err)) s.notFound++
    else {
      s.errors++
      s.lastError = (err as Error)?.message ?? String(err)
    }
    throw err
  } finally {
    const ms = Date.now() - started
    s.totalMs += ms
    if (ms > s.maxMs) s.maxMs = ms
  }
}

// Local cache dir for objects downloaded so a CLI tool (ffmpeg, unzipper) or
// magic-byte sniff can read them as a real file. Lives under SCRATCH_ROOT like
// every other temp file this API writes, so it grows with the same volume.
export const S3_CACHE_DIR = path.join(SCRATCH_ROOT, ".s3cache")

export const s3Driver: StorageDriver = {
  async putFile(key, localPath) {
    const size = fs.statSync(localPath).size
    await timed(
      "put",
      () =>
        client.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: fs.createReadStream(localPath),
            ContentLength: size,
          })
        ),
      () => size
    )
    fs.unlinkSync(localPath)
  },

  async stat(key) {
    try {
      const res = await timed("head", () =>
        client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
      )
      return { size: res.ContentLength ?? 0 }
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  },

  async readStream(key, range) {
    let res
    try {
      res = await timed(
        range ? "get (range)" : "get",
        () =>
          client.send(
            new GetObjectCommand({
              Bucket: BUCKET,
              Key: key,
              Range: range ? `bytes=${range.start}-${range.end}` : undefined,
            })
          ),
        (r) => r.ContentLength ?? 0
      )
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
    if (!res.Body) return null

    // A ranged response's ContentLength is just the slice size; the total
    // object size instead rides in ContentRange ("bytes 1000-1999/50000").
    // A full-object request carries no ContentRange, so ContentLength is
    // already the total in that case.
    const total = res.ContentRange
      ? Number(res.ContentRange.split("/")[1])
      : (res.ContentLength ?? 0)

    return { stream: res.Body as Readable, size: total }
  },

  async localPath(key) {
    let res
    try {
      res = await timed(
        "get (to local)",
        () => client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key })),
        (r) => r.ContentLength ?? 0
      )
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
    if (!res.Body) return null
    fs.mkdirSync(S3_CACHE_DIR, { recursive: true })
    const tmp = path.join(
      S3_CACHE_DIR,
      `${crypto.randomBytes(8).toString("hex")}-${path.basename(key)}`
    )
    await pipeline(res.Body as NodeJS.ReadableStream, fs.createWriteStream(tmp))
    return { path: tmp, cleanup: () => fs.rm(tmp, { force: true }, () => {}) }
  },

  async remove(key) {
    await timed("delete", () =>
      client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
    )
  },

  async removePrefix(prefix) {
    let ContinuationToken: string | undefined
    do {
      const list = await timed("list", () =>
        client.send(
          new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: prefix,
            ContinuationToken,
          })
        )
      )
      const objects = (list.Contents ?? [])
        .map((o) => ({ Key: o.Key }))
        .filter((o): o is { Key: string } => !!o.Key)
      if (objects.length > 0) {
        await timed("delete (batch)", () =>
          client.send(
            new DeleteObjectsCommand({
              Bucket: BUCKET,
              Delete: { Objects: objects },
            })
          )
        )
      }
      ContinuationToken = list.IsTruncated
        ? list.NextContinuationToken
        : undefined
    } while (ContinuationToken)
  },
}
