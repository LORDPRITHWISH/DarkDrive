// How much room each folder takes: "Measure" on the web app's /local page.
// No Electron in here, so the test runs it under plain Node.
import fs from "node:fs"
import path from "node:path"

// Every folder a measure has walked, by path, so going into one that's been
// measured from above costs nothing.
// ponytail: an entry per folder, kept until the app quits. Tens of MB for a
// home folder; make it a tree of names if that turns out to matter.
const sizes = new Map<string, number>()

export const sizeOf = (p: string) => sizes.get(p)

/**
 * The room `dir` takes on disk, and every folder inside it. What's allocated
 * rather than each file's length, as `du` counts: a sparse file is as big as
 * what it has written, and /proc is nothing at all. Links aren't followed.
 */
// ponytail: carries on into other disks mounted inside `dir`. Hold it to one
// st.dev if measuring / turns out to matter.
export async function measure(dir: string): Promise<number> {
  // A folder this user may not look in counts as empty, not as a failure.
  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: Promise<number>[] = []
  let total = 0
  for (const e of entries) {
    const p = path.join(dir, e.name)
    // One folder at a time, so a deep tree isn't all in memory at once.
    if (e.isDirectory()) total += await measure(p)
    else if (e.isFile()) files.push(fs.promises.lstat(p).then((st) => st.blocks * 512, () => 0))
  }
  for (const n of await Promise.all(files)) total += n
  sizes.set(dir, total)
  return total
}

// Forget `p` and everything under it. Answers what `p` was.
function drop(p: string) {
  const was = sizes.get(p)
  for (const k of sizes.keys()) if (k === p || k.startsWith(p + path.sep)) sizes.delete(k)
  return was
}

/** `p`, of `bytes`, left its folder: every measured folder above is that much smaller. */
export function gone(p: string, bytes: number) {
  drop(p)
  for (let at = path.dirname(p); ; at = path.dirname(at)) {
    const n = sizes.get(at)
    if (n !== undefined) sizes.set(at, Math.max(0, n - bytes))
    if (path.dirname(at) === at) break
  }
}

/** `from` is `to` now, in the same folder. What's inside is measured again when asked. */
export function renamed(from: string, to: string) {
  const was = drop(from)
  if (was !== undefined) sizes.set(to, was)
}
