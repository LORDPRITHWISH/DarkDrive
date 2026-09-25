import fs from "node:fs"
import path from "node:path"
import type { StorageDriver } from "./types.js"
import { SCRATCH_ROOT } from "./scratch.js"

function absolutePath(key: string): string {
  const abs = path.resolve(SCRATCH_ROOT, key)
  if (!abs.startsWith(SCRATCH_ROOT)) throw new Error("invalid_storage_key")
  return abs
}

export const localDriver: StorageDriver = {
  async putFile(key, localPath) {
    const dest = absolutePath(key)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    // Same filesystem (both under SCRATCH_ROOT), so this is an atomic,
    // near-instant metadata rename rather than a copy.
    fs.renameSync(localPath, dest)
  },

  async stat(key) {
    try {
      const s = fs.statSync(absolutePath(key))
      return s.isFile() ? { size: s.size } : null
    } catch {
      return null
    }
  },

  async readStream(key, range) {
    const abs = absolutePath(key)
    let size: number
    try {
      const s = fs.statSync(abs)
      if (!s.isFile()) return null
      size = s.size
    } catch {
      return null
    }
    const stream = range
      ? fs.createReadStream(abs, { start: range.start, end: range.end })
      : fs.createReadStream(abs)
    return { stream, size }
  },

  async localPath(key) {
    const abs = absolutePath(key)
    if (!fs.existsSync(abs)) return null
    return { path: abs, cleanup: () => {} }
  },

  async remove(key) {
    const abs = absolutePath(key)
    if (fs.existsSync(abs)) fs.unlinkSync(abs)
  },

  async removePrefix(prefix) {
    fs.rmSync(absolutePath(prefix), { recursive: true, force: true })
  },
}
