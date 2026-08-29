import { File } from "expo-file-system"
import { fetch } from "expo/fetch"
import {
  Asset,
  AssetField,
  MediaType,
  Query,
  getPermissionsAsync,
  type AssetMetadata,
} from "expo-media-library"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import { api, ApiError, apiBase, authHeaders, configure } from "./api"
import { loadCredentials, loadLedger, saveLedger, type Ledger } from "./state"

// Camera-roll backup. The device's media library is read-only as far as this
// app is concerned: nothing is ever deleted or modified locally, photos are
// only copied up. That asymmetry is why this is far simpler than the two-way
// folder sync in apps/mobile — there are no conflicts to resolve.

export type Progress = (line: string) => void

// How many assets to move per pass in the background. A first backup of a big
// library therefore takes several passes, which is what keeps the OS from
// killing the task (and the battery from noticing).
const BATCH = 40
// Hashes per dedupe request. Comfortably under the endpoint's cap of 1000.
const HAVE_BATCH = 50
const PAGE = 200
// Walking newest-first, this many already-known assets in a row means we have
// reached the part of the library an earlier pass already dealt with.
const KNOWN_RUN_STOP = PAGE
// Bound on the counting scan, so the Backup tab can't sit on a 100k-photo
// library. Past this the UI just says "lots".
const COUNT_SCAN_MAX = 50_000

const HASH_BLOCK = 1024 * 1024

const photosAndVideos = () =>
  new Query()
    .within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO])
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false })

// expo-file-system has no digest of its own, and one-shot hashing would mean
// holding an entire video in memory. Reading through a handle in 1MB blocks
// keeps this flat regardless of file size.
// ponytail: every asset is hashed once, ever — the ledger means we never pay
// again. A multi-GB video still costs one full read on its first pass.
function hashOf(file: File): string {
  const h = sha256.create()
  const handle = file.open()
  try {
    for (;;) {
      const block = handle.readBytes(HASH_BLOCK)
      if (block.length === 0) break
      h.update(block)
    }
  } finally {
    handle.close()
  }
  return bytesToHex(h.digest())
}

/**
 * The on-device file behind an asset. iOS hands out `ph://` identifiers that
 * the filesystem can't open, and only the fuller `getInfo()` resolves those to
 * a real path — hence the two-step.
 */
async function localFileFor(id: string): Promise<File | null> {
  const asset = new Asset(id)
  let uri = await asset.getUri()
  if (!uri.startsWith("file://")) uri = (await asset.getInfo()).uri
  return uri.startsWith("file://") ? new File(uri) : null
}

type Pending = { meta: AssetMetadata; file: File; sha: string; name: string }

/**
 * Walks the library newest-first and returns up to `limit` assets that aren't
 * in the ledger yet.
 *
 * Once a full scan has completed, later passes stop after a page of
 * consecutive already-known assets: sorted by creation time, everything older
 * is settled. The exception is an *old* photo added later — an AirDrop, a
 * scan, a restored backup — which lands deep in the list where the early stop
 * never reaches. "Rescan library" in the UI clears `scanned` to force the full
 * walk that picks those up.
 */
async function findPending(ledger: Ledger, limit: number, log: Progress): Promise<Pending[]> {
  const out: Pending[] = []
  let offset = 0
  let knownRun = 0

  for (;;) {
    const page = await photosAndVideos().offset(offset).limit(PAGE).exeForMetadata()
    if (!page.length) {
      ledger.scanned = true
      return out
    }
    offset += page.length

    for (const meta of page) {
      if (ledger.done[meta.id]) {
        knownRun++
        continue
      }
      knownRun = 0
      const name = meta.filename ?? `${meta.id}.jpg`
      try {
        const file = await localFileFor(meta.id)
        if (!file) {
          // iCloud-only originals and cloud-backed Android media have no local
          // bytes to read; they come back on a later pass once downloaded.
          log(`skipped ${name} (not downloaded to this device)`)
          continue
        }
        out.push({ meta, file, sha: hashOf(file), name })
      } catch (e: any) {
        // One unreadable asset (permissions, deleted mid-scan) must not stop
        // the rest of the backup.
        log(`skipped ${name}: ${e?.message ?? "unreadable"}`)
      }
      if (out.length >= limit) return out
    }

    if (page.length < PAGE) {
      ledger.scanned = true
      return out
    }
    if (ledger.scanned && knownRun >= KNOWN_RUN_STOP) return out
  }
}

/** Which of these hashes the server already holds, so they're never re-sent. */
async function alreadyOnServer(pending: Pending[]): Promise<Set<string>> {
  const have = new Set<string>()
  for (let i = 0; i < pending.length; i += HAVE_BATCH) {
    const batch = pending.slice(i, i + HAVE_BATCH).map((p) => p.sha)
    const res = await api<{ have: string[] }>("POST", "/api/gallery/have", { sha256: batch })
    for (const sha of res.have) have.add(sha)
  }
  return have
}

async function upload(p: Pending, folderId: string): Promise<void> {
  const size = p.file.size ?? 0
  // The library's own creation time is authoritative for HEIC and video, where
  // the server can't read a capture date out of the bytes. It only fills in
  // when the file carries no EXIF of its own.
  const takenAtMs = p.meta.creationTime || p.meta.modificationTime || 0

  const init = await api<{ uploadId: string; chunkSize: number }>(
    "POST",
    "/api/files/upload/init",
    {
      folderId,
      name: p.name,
      size,
      takenAt: takenAtMs ? new Date(takenAtMs).toISOString() : undefined,
    }
  )
  const total = Math.max(1, Math.ceil(size / init.chunkSize))

  try {
    for (let i = 0; i < total; i++) {
      const form = new FormData()
      form.append("chunkIndex", String(i))
      // File extends Blob here, so the bytes stream from disk rather than
      // through JS memory.
      const part =
        total === 1 ? p.file : p.file.slice(i * init.chunkSize, (i + 1) * init.chunkSize)
      form.append("chunk", part as any, p.name)
      const res = await fetch(`${apiBase()}/api/files/upload/${init.uploadId}/chunk`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      })
      if (!res.ok) throw new ApiError(`chunk ${i} of ${p.name} -> ${res.status}`, res.status)
    }
    await api("POST", `/api/files/upload/${init.uploadId}/complete`, { totalChunks: total })
  } catch (e) {
    await api("DELETE", `/api/files/upload/${init.uploadId}`).catch(() => {})
    throw e
  }
}

let running = false

export type BackupResult = { uploaded: number; deduped: number; failed: number }

/**
 * One backup pass. Safe to call from the UI and the background task at the
 * same time — the second caller no-ops rather than double-uploading.
 */
export async function backupOnce(log: Progress = () => {}, limit = BATCH): Promise<BackupResult> {
  const result: BackupResult = { uploaded: 0, deduped: 0, failed: 0 }
  if (running) return result
  running = true
  try {
    const creds = await loadCredentials()
    if (!creds) return result
    configure(creds.apiUrl, creds.token)

    if (!(await getPermissionsAsync()).granted) {
      log("no photo library permission")
      return result
    }

    const ledger = loadLedger()
    if (!ledger.autoBackup) return result

    const pending = await findPending(ledger, limit, log)
    if (!pending.length) {
      ledger.lastRunAt = Date.now()
      saveLedger(ledger)
      return result
    }

    // The photos root comes back with the timeline; asking for it is also what
    // creates "My Photos" on a brand-new account.
    const { photosRootId } = await api<{ photosRootId: string }>(
      "GET",
      "/api/gallery/timeline?limit=1"
    )
    const have = await alreadyOnServer(pending)

    for (const p of pending) {
      try {
        if (have.has(p.sha)) {
          // Same bytes are already up there — another device backed this photo
          // up, or this app was reinstalled. Just record it as done.
          ledger.done[p.meta.id] = true
          result.deduped++
          continue
        }
        await upload(p, photosRootId)
        ledger.done[p.meta.id] = true
        have.add(p.sha)
        result.uploaded++
        ledger.uploaded++
        log(`↑ ${p.name}`)
      } catch (e: any) {
        // Left out of the ledger on purpose: the next pass retries it.
        result.failed++
        log(`! ${p.name}: ${e?.message ?? "failed"}`)
      }
      // Saved as we go, so a pass killed mid-flight doesn't re-upload what it
      // had already finished.
      saveLedger(ledger)
    }

    ledger.lastRunAt = Date.now()
    saveLedger(ledger)
    return result
  } finally {
    running = false
  }
}

/** How many library assets still need backing up. Capped — see COUNT_SCAN_MAX. */
export async function countPending(): Promise<number> {
  if (!(await getPermissionsAsync()).granted) return 0
  const { done } = loadLedger()
  let pending = 0
  for (let offset = 0; offset < COUNT_SCAN_MAX; offset += 1000) {
    const page = await photosAndVideos().offset(offset).limit(1000).exeForMetadata()
    for (const meta of page) if (!done[meta.id]) pending++
    if (page.length < 1000) break
  }
  return pending
}
