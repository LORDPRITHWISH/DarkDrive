import { env } from "../env.js"
import { prisma } from "../db/prisma.js"
import type { StorageDriver } from "./types.js"
import { localDriver } from "./local.js"
import { rawStorageKey } from "./scratch.js"

export type DriverName = "local" | "s3"

export function isS3Configured(): boolean {
  return !!(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY)
}

// s3.ts throws at import time if credentials are missing, so it's only ever
// imported once actually needed — a local-only deployment never touches it.
const instances: Partial<Record<DriverName, StorageDriver>> = { local: localDriver }
async function driverInstance(name: DriverName): Promise<StorageDriver> {
  if (!instances[name]) instances[name] = (await import("./s3.js")).s3Driver
  return instances[name]!
}

const SETTING_KEY = "storageDriver"

async function loadActiveDriverName(): Promise<DriverName> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } })
    if (row?.value === "s3" || row?.value === "local") {
      // Config can drift (env vars removed after an admin picked S3) — don't
      // trust a stale DB value into crashing every upload at boot.
      if (row.value === "s3" && !isS3Configured()) {
        console.error("[storage] saved driver is 's3' but S3_* env vars are missing — falling back to local")
        return "local"
      }
      return row.value
    }
  } catch (err) {
    console.error("[storage] couldn't read saved driver, falling back to STORAGE_DRIVER env:", err)
  }
  return env.STORAGE_DRIVER
}

// Which backend NEW keys are written under. Loaded once at boot (falls back
// to STORAGE_DRIVER if no admin choice is saved yet) and kept in sync
// in-process by setActiveDriverName — see routes/admin.ts's storage-driver
// endpoint. Reads never depend on this: every key carries its own driver as
// a prefix (see parseKey), so a live switch only affects files uploaded
// after it, never ones already on disk/in the bucket.
let active: DriverName = await loadActiveDriverName()

export function getActiveDriverName(): DriverName {
  return active
}

export async function setActiveDriverName(name: DriverName): Promise<void> {
  if (name === "s3" && !isS3Configured()) throw new Error("s3_not_configured")
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: name },
    update: { value: name },
  })
  active = name
}

export function newStorageKey(originalName: string): string {
  return `${active}:${rawStorageKey(originalName)}`
}

function parseKey(key: string): { driver: DriverName; raw: string } {
  const m = /^(local|s3):(.*)$/s.exec(key)
  if (m) return { driver: m[1] as DriverName, raw: m[2] }
  // Keys written before multi-backend support existed carry no prefix — they
  // were always local disk.
  return { driver: "local", raw: key }
}

export const storage: StorageDriver = {
  async putFile(key, localPath) {
    const { driver, raw } = parseKey(key)
    await (await driverInstance(driver)).putFile(raw, localPath)
  },
  async stat(key) {
    const { driver, raw } = parseKey(key)
    return (await driverInstance(driver)).stat(raw)
  },
  async readStream(key, range) {
    const { driver, raw } = parseKey(key)
    return (await driverInstance(driver)).readStream(raw, range)
  },
  async localPath(key) {
    const { driver, raw } = parseKey(key)
    return (await driverInstance(driver)).localPath(raw)
  },
  async remove(key) {
    const { driver, raw } = parseKey(key)
    await (await driverInstance(driver)).remove(raw)
  },
  async removePrefix(prefix) {
    // Not a real storage key (no driver prefix) — this is the derived-audio
    // cache's convention path (lib/audioTracks.ts), which deliberately isn't
    // key-prefixed: a variant generated under one backend just gets
    // regenerated on a cache miss after a driver switch, cheaper than
    // tracking it. Sweep every backend that's actually usable so a stale
    // cache entry under a since-abandoned backend doesn't linger forever.
    await localDriver.removePrefix(prefix).catch(() => {})
    if (isS3Configured()) {
      await (await driverInstance("s3")).removePrefix(prefix).catch(() => {})
    }
  },
}

export { newScratchPath, SCRATCH_ROOT } from "./scratch.js"
export type { StorageDriver } from "./types.js"
