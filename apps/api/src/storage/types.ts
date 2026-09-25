import type { Readable } from "node:stream"

export interface StorageDriver {
  // Move/upload an already-fully-written local file into the store at `key`.
  // Callers assemble to a local path first (multer, ffmpeg output, chunked
  // upload) and commit it here as the last step.
  putFile(key: string, localPath: string): Promise<void>

  // Byte size, or null if the key doesn't exist.
  stat(key: string): Promise<{ size: number } | null>

  // Stream bytes for an HTTP response, honoring an optional byte range.
  // Resolves null if the key doesn't exist.
  readStream(
    key: string,
    range?: { start: number; end: number }
  ): Promise<{ stream: Readable; size: number } | null>

  // A real local fs path for tools that need one (ffmpeg/ffprobe/libreoffice
  // CLIs, unzipper's random-access central-directory reads, magic-byte
  // sniffing). Local driver returns the file itself; S3 downloads to a temp
  // file. Always call the returned cleanup() when done with it.
  localPath(key: string): Promise<{ path: string; cleanup: () => void } | null>

  remove(key: string): Promise<void>

  // Remove every key under a prefix (e.g. derived-audio/<fileId>/).
  removePrefix(prefix: string): Promise<void>
}
