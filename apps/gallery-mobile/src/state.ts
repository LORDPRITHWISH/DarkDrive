import { File, Paths } from "expo-file-system"
import * as SecureStore from "expo-secure-store"

// Unlike the DarkDrive app there is no synced folder here — the source of
// truth is the device's own media library, and all this app keeps locally is a
// ledger of which assets have already made it to the server.
const LEDGER_FILE = new File(Paths.document, "backup-ledger.json")

export type Ledger = {
  /** Media-library asset ids already on the server. */
  done: Record<string, true>
  /** Whether a full library scan has ever completed (see backup.ts). */
  scanned: boolean
  autoBackup: boolean
  lastRunAt: number | null
  uploaded: number
}

export const emptyLedger = (): Ledger => ({
  done: {},
  scanned: false,
  autoBackup: true,
  lastRunAt: null,
  uploaded: 0,
})

// ponytail: one JSON blob rewritten per run — a 20k-photo library is a few
// hundred KB, which is nothing to write once a pass. Move to SQLite if a
// library ever gets big enough for the write to be felt.
export function loadLedger(): Ledger {
  try {
    if (!LEDGER_FILE.exists) return emptyLedger()
    return { ...emptyLedger(), ...JSON.parse(LEDGER_FILE.textSync()) }
  } catch {
    // A corrupt ledger costs a re-scan, not data: every asset is re-hashed and
    // the server's dedupe check answers "already have it" for all of them.
    return emptyLedger()
  }
}

export function saveLedger(ledger: Ledger) {
  if (!LEDGER_FILE.exists) LEDGER_FILE.create()
  LEDGER_FILE.write(JSON.stringify(ledger))
}

// --- credentials -----------------------------------------------------------
// SecureStore, not the ledger file: the device token is a long-lived bearer
// credential and belongs in the keychain / Android keystore.

const KEY_TOKEN = "dg_token"
const KEY_API = "dg_api"

export type Credentials = { apiUrl: string; token: string }

export async function loadCredentials(): Promise<Credentials | null> {
  const token = await SecureStore.getItemAsync(KEY_TOKEN)
  if (!token) return null
  return { token, apiUrl: (await SecureStore.getItemAsync(KEY_API)) ?? "" }
}

export async function saveCredentials(c: Credentials) {
  await SecureStore.setItemAsync(KEY_TOKEN, c.token)
  await SecureStore.setItemAsync(KEY_API, c.apiUrl)
}

export async function clearCredentials() {
  for (const k of [KEY_TOKEN, KEY_API]) await SecureStore.deleteItemAsync(k)
  if (LEDGER_FILE.exists) LEDGER_FILE.delete()
}
