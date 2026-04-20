import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { env } from "../env.js"

export const STORAGE_ROOT = path.resolve(process.cwd(), env.STORAGE_DIR)

fs.mkdirSync(STORAGE_ROOT, { recursive: true })

export function newStorageKey(originalName: string): string {
  const ext = path.extname(originalName)
  const id = crypto.randomBytes(16).toString("hex")
  return path.posix.join(id.slice(0, 2), id.slice(2, 4), `${id}${ext}`)
}

export function absolutePath(storageKey: string): string {
  const abs = path.resolve(STORAGE_ROOT, storageKey)
  if (!abs.startsWith(STORAGE_ROOT)) throw new Error("invalid_storage_key")
  return abs
}

export function ensureDirFor(storageKey: string): string {
  const abs = absolutePath(storageKey)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  return abs
}

export function removeFile(storageKey: string): void {
  const abs = absolutePath(storageKey)
  if (fs.existsSync(abs)) fs.unlinkSync(abs)
}
