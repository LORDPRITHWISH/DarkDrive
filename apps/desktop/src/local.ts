// Browsing this computer from inside the app: the web app's /local page.
//
// Everything else the bridge does goes by a DarkDrive id, and main finds the
// path. This can't: the page says which folder to look in. So each thing
// here is limited on its own account, in case the page is ever not itself:
//   - listing gives names, sizes and dates, never what's in a file;
//   - opening hands a file to the app it belongs to, except one that would
//     run, which is only shown in the file manager;
//   - syncing a folder uploads it, so main asks first, in a dialog of its
//     own that a page can't answer;
//   - deleting asks the same way, and only ever moves to the bin;
//   - a new name is one name: nothing is moved out of its folder (into a
//     synced one, say, which would upload it), and nothing is overwritten.
import { app, dialog, shell } from "electron"
import fs from "node:fs"
import path from "node:path"
import type { LocalEntry, LocalListing } from "../../web/src/lib/desktop.js"
import * as folders from "./folders.js"
import type { Settings } from "./settings.js"
import * as usage from "./usage.js"

// What "opening" would start rather than show. Not exhaustive, and it needn't
// be: the worst a miss does is what double-clicking it in a file manager does.
const RUNS = new Set(
  ".desktop .appimage .jar .exe .com .bat .cmd .msi .scr .pif .lnk .ps1 .vbs .vbe .js .jse .wsf .wsh .hta .cpl .reg".split(" ")
)

const PLACES = ["home", "desktop", "documents", "downloads", "pictures", "videos", "music"] as const

// Left out of a listing. Hidden is a leading dot here; on Windows it's an
// attribute Node can't read, so the clutter every folder there has goes by name.
const HIDDEN =
  process.platform === "win32" ? /^[.$]|^(desktop\.ini|thumbs\.db|system volume information)$|^ntuser\./i : /^\./

const DRIVE_CHECK_MS = 300

/**
 * Windows' drives, which no folder contains: there's no going up from C:\ to
 * find D:\. Each gets a moment to answer and no longer, since a network drive
 * that's gone can take half a minute to say so.
 */
async function drives(): Promise<string[]> {
  if (process.platform !== "win32") return []
  const roots = [..."CDEFGHIJKLMNOPQRSTUVWXYZ"].map((letter) => `${letter}:\\`)
  const there = (root: string) =>
    Promise.race([
      fs.promises.access(root).then(() => true, () => false),
      new Promise<boolean>((done) => setTimeout(done, DRIVE_CHECK_MS, false)),
    ])
  const up = await Promise.all(roots.map(there))
  return roots.filter((_, i) => up[i])
}

async function places(s: Settings) {
  const found = new Map<string, string>() // dir -> name, so one shows once
  for (const name of PLACES) {
    let dir: string
    try {
      dir = app.getPath(name)
    } catch {
      continue // this desktop has no such folder
    }
    if (!found.has(dir) && fs.existsSync(dir)) found.set(dir, name === "home" ? "Home" : path.basename(dir))
  }
  for (const f of s.folders) if (!found.has(f.dir)) found.set(f.dir, f.name)
  for (const root of await drives()) if (!found.has(root)) found.set(root, root.slice(0, 2))
  return [...found].map(([dir, name]) => ({ name, dir }))
}

// A path from the page: a string, and absolute once resolved.
const clean = (p: unknown) => {
  if (typeof p !== "string" || !path.isAbsolute(p)) throw new Error("That isn't a place on this computer.")
  return path.resolve(p)
}

// A name from the page, for something in a folder: one name, not a way out of it.
const named = (n: unknown) => {
  const name = typeof n === "string" ? n.trim() : ""
  if (!name || name !== path.basename(name) || name === "." || name === "..") throw new Error("That name won't work.")
  return name
}

// Where something new would go, if nothing's there: rename() replaces a file without a word.
const free = (dir: string, name: unknown) => {
  const p = path.join(dir, named(name))
  if (fs.existsSync(p)) throw new Error(`There's already a "${path.basename(p)}" here.`)
  return p
}

// A synced folder moved or binned is, to its daemon, a folder that was emptied.
const assertLoose = (s: Settings, p: string) => {
  const f = folders.syncedIn(s, p)
  if (f) throw new Error(`"${f.name}" is synced from here. Stop syncing it first, under Sync.`)
}

// The disk `dir` is on. Not every filesystem says.
function disk(dir: string) {
  try {
    const d = fs.statfsSync(dir)
    return { total: d.blocks * d.bsize, free: d.bavail * d.bsize }
  } catch {
    return null
  }
}

// ponytail: a stat per entry, all at once. Page it if folders with tens of
// thousands of files turn out to matter.
export async function list(s: Settings, where?: unknown, hidden?: unknown): Promise<LocalListing> {
  const dir = where === undefined || where === null ? app.getPath("home") : clean(where)
  const entries: LocalEntry[] = []
  for (const name of fs.readdirSync(dir)) {
    if (!hidden && HIDDEN.test(name)) continue
    const p = path.join(dir, name)
    // Followed, so a link to a folder opens as one. Skipped if it can't be: a
    // broken link, or something this user may not look at, which mustn't
    // take the rest of the folder with it (every Windows home has several).
    let st: fs.Stats
    try {
      st = fs.statSync(p)
    } catch {
      continue
    }
    if (!(st.isDirectory() || st.isFile())) continue
    const size = st.isDirectory() ? (usage.sizeOf(p) ?? null) : st.size
    entries.push({ name, path: p, dir: st.isDirectory(), size, modified: st.mtimeMs, route: folders.routeOf(s, p) })
  }
  entries.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true }))
  const parents: LocalListing["parents"] = []
  for (let at = dir; ; at = path.dirname(at)) {
    parents.unshift({ name: path.basename(at) || at, dir: at })
    if (path.dirname(at) === at) break
  }
  return { dir, parents, places: await places(s), entries, size: usage.sizeOf(dir) ?? null, disk: disk(dir) }
}

/** Work out how big `dir` and every folder in it is; list() has the sizes from then on. */
export const measure = async (where: unknown) => void (await usage.measure(clean(where)))

/** Answers where the new folder is. */
export function newFolder(where: unknown, name: unknown) {
  const p = free(clean(where), name)
  fs.mkdirSync(p)
  return p
}

export function rename(s: Settings, where: unknown, name: unknown) {
  const from = clean(where)
  assertLoose(s, from)
  const to = free(path.dirname(from), name)
  fs.renameSync(from, to)
  usage.renamed(from, to)
}

// How many paths the dialog spells out before it just counts the rest.
const TRASH_LISTED = 8

/** Move things to the bin, if the user says so here. Answers whether they went. */
export async function trash(s: Settings, where: unknown): Promise<boolean> {
  const paths = (Array.isArray(where) ? where : [where]).map(clean)
  if (!paths.length) return false
  for (const p of paths) assertLoose(s, p)
  const more = paths.length - TRASH_LISTED
  const { response } = await dialog.showMessageBox({
    type: "warning",
    message: paths.length === 1 ? `Move "${path.basename(paths[0])}" to the bin?` : `Move these ${paths.length} to the bin?`,
    detail:
      paths.slice(0, TRASH_LISTED).join("\n") +
      (more > 0 ? `\nand ${more} more` : "") +
      (paths.some((p) => folders.routeOf(s, p)) ? "\n\nWhat's in a synced folder leaves DarkDrive and your other computers too." : ""),
    buttons: ["Move to bin", "Cancel"],
    defaultId: 1,
    cancelId: 1,
  })
  if (response !== 0) return false
  for (const p of paths) {
    const st = fs.lstatSync(p)
    await shell.trashItem(p)
    usage.gone(p, st.isDirectory() ? (usage.sizeOf(p) ?? 0) : st.blocks * 512)
  }
  return true
}

export async function open(where: unknown) {
  const p = clean(where)
  if (RUNS.has(path.extname(p).toLowerCase())) return shell.showItemInFolder(p)
  const failed = await shell.openPath(p)
  if (failed) throw new Error(failed)
}

export const show = (where: unknown) => shell.showItemInFolder(clean(where))

/** Start syncing a folder the page picked, if the user says so here. */
export async function sync(s: Settings, where: unknown): Promise<boolean> {
  const dir = clean(where)
  if (!fs.statSync(dir).isDirectory()) throw new Error("Only folders can be synced.")
  const { response } = await dialog.showMessageBox({
    type: "question",
    message: `Sync "${path.basename(dir)}" with DarkDrive?`,
    detail: `${dir}\n\nEverything in it is uploaded to Synced Folders, and kept the same here and there from then on.`,
    buttons: ["Sync", "Cancel"],
    defaultId: 0,
    cancelId: 1,
  })
  if (response !== 0) return false
  await folders.addLocal(s, dir)
  return true
}
