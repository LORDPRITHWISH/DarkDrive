// The desktop app (apps/desktop) ships this web app inside itself and adds
// what a browser can't do — folder sync, the tray, signing in with a device
// token — through this object, set by its preload (drive-preload.cts). It's
// absent in a browser, so everything desktop-only hangs off it.

export type SyncedFolder = { id: string; name: string; dir: string }

/** Local "HH:MM" times sync may run between; `to` before `from` runs overnight. */
export type SyncHours = { from: string; to: string }

/** Something in a folder on this computer. `route` is its page in DarkDrive, if a synced folder has it. */
export type LocalEntry = {
  name: string
  path: string
  dir: boolean
  size: number
  /** ms */
  modified: number
  route: string | null
}

export type LocalListing = {
  dir: string
  /** From the top of the disk down to `dir` itself. */
  parents: { name: string; dir: string }[]
  /** Shortcuts: home, Documents, Downloads…, and the synced folders. */
  places: { name: string; dir: string }[]
  /** Folders first, then by name. Hidden files are left out. */
  entries: LocalEntry[]
}

export type DesktopState = {
  apiUrl: string
  webUrl: string
  device: string
  folders: SyncedFolder[]
  syncing: boolean
  /** How sync is doing, in a few words: "Up to date", "Paused until 14:00". */
  status: string
  /** When a pause ends, in ms; in the past (0) when sync isn't paused. */
  pausedUntil: number
  /** null: sync may run all day. */
  hours: SyncHours | null
  log: string[]
  version: string
  updateReady: string | null
  /** The pairing page a sign-in is waiting on, to paste into another browser. */
  signInUrl: string | null
}

export type Desktop = {
  /** Where this computer's API and hosted web app are. Fixed for the page's life: changing them reloads it. */
  apiUrl: string
  webUrl: string
  /** Opens the browser to approve this computer; the app reloads signed in. */
  signIn(): Promise<void>
  signOut(): Promise<void>
  /** Claims a temporary login code; answers the claim's HTTP status (200: the app reloads signed in). */
  tempSignIn(code: string): Promise<number>
  saveServer(s: { apiUrl: string; webUrl: string; device: string }): Promise<void>
  getState(): Promise<DesktopState>
  /** Calls `fn` whenever getState() would answer differently. Returns the unsubscribe. */
  onChange(fn: () => void): () => void
  /** Pause sync until a time in ms. 0 resumes it now; Infinity pauses until it's resumed. */
  pauseUntil(until: number): Promise<void>
  /** Only sync between these times each day, or all day (null). */
  setSyncHours(hours: SyncHours | null): Promise<void>
  /** Folders in Synced Folders this computer doesn't keep yet. */
  availableFolders(): Promise<{ id: string; name: string }[]>
  addLocalFolder(): Promise<void>
  addRemoteFolder(id: string): Promise<void>
  removeFolder(id: string): Promise<void>
  /** Where a file or folder is on this computer, if a synced folder has it here. */
  localPath(type: "file" | "folder", id: string): Promise<string | null>
  /** In the file manager: a folder opened, a file selected in its folder. */
  show(type: "file" | "folder", id: string): Promise<void>
  installUpdate(): Promise<void>
  /** What's in a folder on this computer; the home folder when none is given. */
  listLocal(dir?: string): Promise<LocalListing>
  /** Open a file with the app it belongs to. One that would run is shown in the file manager instead. */
  openLocal(path: string): Promise<void>
  showLocal(path: string): Promise<void>
  /** Start syncing a folder, after the desktop app asks to be sure. Answers whether it went ahead. */
  syncLocal(dir: string): Promise<boolean>
}

export const desktop = (window as { darkdriveDesktop?: Desktop }).darkdriveDesktop
