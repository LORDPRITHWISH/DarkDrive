import { Directory, File, Paths } from "expo-file-system"
import * as SecureStore from "expo-secure-store"

/** The folder that actually syncs. Exposed to Files.app (iOS) and the Android
 *  file browser via the app.json flags, so it behaves like a real folder. */
export const ROOT = new Directory(Paths.document, "DarkDrive")
/** State lives beside the synced folder, never inside it. */
const STATE_FILE = new File(Paths.document, "sync-state.json")

export type Entry = { id: string; sha: string; size: number }
export type SyncState = {
  cursor: string
  files: Record<string, Entry>
  folders: Record<string, string>
}

export const emptyState = (): SyncState => ({
  cursor: new Date(0).toISOString(),
  files: {},
  folders: {},
})

export function loadState(): SyncState {
  try {
    if (!STATE_FILE.exists) return emptyState()
    return { ...emptyState(), ...JSON.parse(STATE_FILE.textSync()) }
  } catch {
    // A corrupt state file is recoverable: an empty state just means the next
    // pass re-reconciles from scratch, and decidePull refuses to overwrite any
    // local file it can't account for.
    return emptyState()
  }
}

export function saveState(state: SyncState) {
  if (!STATE_FILE.exists) STATE_FILE.create()
  STATE_FILE.write(JSON.stringify(state))
}

// --- credentials --------------------------------------------------------
// SecureStore, not the state file: the device token is a long-lived bearer
// credential and belongs in the keychain / Android keystore.

const KEY_TOKEN = "dd_token"
const KEY_API = "dd_api"
const KEY_DEVICE = "dd_device"

export type Credentials = { apiUrl: string; token: string; device: string }

export async function loadCredentials(): Promise<Credentials | null> {
  const token = await SecureStore.getItemAsync(KEY_TOKEN)
  if (!token) return null
  return {
    token,
    apiUrl: (await SecureStore.getItemAsync(KEY_API)) ?? "",
    device: (await SecureStore.getItemAsync(KEY_DEVICE)) ?? "phone",
  }
}

export async function saveCredentials(c: Credentials) {
  await SecureStore.setItemAsync(KEY_TOKEN, c.token)
  await SecureStore.setItemAsync(KEY_API, c.apiUrl)
  await SecureStore.setItemAsync(KEY_DEVICE, c.device)
}

export async function clearCredentials() {
  for (const k of [KEY_TOKEN, KEY_API, KEY_DEVICE]) await SecureStore.deleteItemAsync(k)
  if (STATE_FILE.exists) STATE_FILE.delete()
}
