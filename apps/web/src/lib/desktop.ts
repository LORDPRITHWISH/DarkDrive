// The desktop app (apps/desktop) ships this web app inside itself and adds
// what a browser can't do — folder sync, the tray, signing in with a device
// token — through this object, set by its preload (drive-preload.cts). It's
// absent in a browser, so everything desktop-only hangs off it.

export type SyncedFolder = { id: string; name: string; dir: string }

export type DesktopState = {
  apiUrl: string
  webUrl: string
  device: string
  folders: SyncedFolder[]
  syncing: boolean
  log: string[]
  version: string
  updateReady: string | null
}

export type Desktop = {
  /** Where this computer's API and hosted web app are. Fixed for the page's life: changing them reloads it. */
  apiUrl: string
  webUrl: string
  /** Opens the browser to approve this computer; the app reloads signed in. */
  signIn(): Promise<void>
  signOut(): Promise<void>
  saveServer(s: { apiUrl: string; webUrl: string; device: string }): Promise<void>
  getState(): Promise<DesktopState>
  /** Calls `fn` whenever getState() would answer differently. Returns the unsubscribe. */
  onChange(fn: () => void): () => void
  setSyncing(on: boolean): Promise<void>
  /** Folders in Synced Folders this computer doesn't keep yet. */
  availableFolders(): Promise<{ id: string; name: string }[]>
  addLocalFolder(): Promise<void>
  addRemoteFolder(id: string): Promise<void>
  removeFolder(id: string): Promise<void>
  openFolder(id: string): Promise<void>
  installUpdate(): Promise<void>
}

export const desktop = (window as { darkdriveDesktop?: Desktop }).darkdriveDesktop
