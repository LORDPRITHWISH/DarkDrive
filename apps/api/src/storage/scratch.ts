import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { env } from "../env.js"

// Local disk, used as scratch space regardless of which StorageDriver is
// active: chunked-upload assembly, multer's tmp destination, ffmpeg/
// libreoffice working directories. Point STORAGE_DIR at a mounted block
// storage volume to grow it independently of the root disk.
export const SCRATCH_ROOT = path.resolve(process.cwd(), env.STORAGE_DIR)
fs.mkdirSync(SCRATCH_ROOT, { recursive: true })

// The shard/id/ext shape a key takes, independent of which backend it's
// written under — see storage/index.ts's newStorageKey, which prefixes this
// with the active driver's name.
export function rawStorageKey(originalName: string): string {
  const ext = path.extname(originalName)
  const id = crypto.randomBytes(16).toString("hex")
  return path.posix.join(id.slice(0, 2), id.slice(2, 4), `${id}${ext}`)
}

// A fresh path under local scratch space to assemble a file into before
// handing it to storage.putFile() — used by every write path (chunked
// upload, URL import, zip extraction, derived thumbnails) so the "write
// locally, then commit to whichever backend is active" shape doesn't repeat
// per call site.
export function newScratchPath(): string {
  const dir = path.join(SCRATCH_ROOT, ".tmp")
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, crypto.randomBytes(16).toString("hex"))
}
