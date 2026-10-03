// DarkDrive in the file manager: right-click actions (Sync with DarkDrive,
// Open in DarkDrive, pause and resume) and sync-status emblems.
//
// On Linux that's GNOME Files, through the nautilus-python extension in
// ../nautilus/darkdrive.py, which this installs for the user and feeds
// filemanager.json: where the app is, and each synced folder with how it's doing.
// On Windows the installer adds the right-click actions (build/installer.nsh)
// and there's nothing to do here. Either way the actions come back as
// arguments to a second copy of the app (handle() in main.ts).
//
// ponytail: GNOME Files only. Dolphin wants a service menu and a C++ overlay
// plugin, Explorer's overlays a COM shell extension: add them when someone
// on KDE or Windows asks for emblems.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { CONFIG_DIR, type Settings } from "./settings.js"

const EXTENSION = path.join(__dirname, "../nautilus/darkdrive.py")
const STATUS_FILE = path.join(CONFIG_DIR, "filemanager.json")

/**
 * Put the extension where GNOME Files looks. True if that changed anything:
 * Files only loads extensions as it starts, and it stays running in the
 * background with every window closed, so a new one needs it restarted.
 */
export function install(): boolean {
  if (process.platform !== "linux") return false
  const dir = path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local/share"), "nautilus-python/extensions")
  const dest = path.join(dir, "darkdrive.py")
  const ours = fs.readFileSync(EXTENSION)
  if (fs.existsSync(dest) && fs.readFileSync(dest).equals(ours)) return false
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(dest, ours)
  return true
}

let published = ""

/** Tell the extension how things stand. Cheap to call on every change: it only writes a new answer. */
export function publish(s: Settings, paused: boolean, statusOf: (id: string) => string) {
  const next = JSON.stringify({
    exec: process.execPath,
    paused,
    folders: s.folders.map((f) => ({ id: f.id, dir: f.dir, status: statusOf(f.id) })),
  })
  if (next === published) return
  published = next
  // Nothing has made it yet on a first run: settings are only written once there's something to save.
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  // Renamed into place: the extension polls this, and must never read half of it.
  fs.writeFileSync(STATUS_FILE + ".part", next)
  fs.renameSync(STATUS_FILE + ".part", STATUS_FILE)
}
