import type { FileItem, Folder } from "@/lib/types"
import type { SortState } from "@/store/drive"

// Shared comparators — folders and files each get sorted independently. The
// UI always renders folders above files, so we never have to rank a folder
// against a file.

const nameCompare = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
}).compare

function typeOf(f: FileItem): string {
  // Group by top-level MIME category first, then specific type. "image/png"
  // clusters with other images; unknown types fall to the end.
  if (!f.mimeType) return "zzz-unknown"
  return f.mimeType
}

function withDir<T>(cmp: (a: T, b: T) => number, dir: "asc" | "desc") {
  return dir === "asc" ? cmp : (a: T, b: T) => -cmp(a, b)
}

export function sortFolders(folders: Folder[], sort: SortState): Folder[] {
  const list = folders.slice()
  const { key, dir } = sort
  if (key === "size" || key === "type") {
    // Neither applies to folders — fall back to name so the order is stable.
    list.sort(withDir((a, b) => nameCompare(a.name, b.name), dir))
  } else if (key === "modified") {
    list.sort(
      withDir(
        (a, b) =>
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
        dir
      )
    )
  } else {
    list.sort(withDir((a, b) => nameCompare(a.name, b.name), dir))
  }
  return list
}

export function sortFiles(files: FileItem[], sort: SortState): FileItem[] {
  const list = files.slice()
  const { key, dir } = sort
  if (key === "size") {
    list.sort(withDir((a, b) => a.size - b.size, dir))
  } else if (key === "modified") {
    list.sort(
      withDir(
        (a, b) =>
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
        dir
      )
    )
  } else if (key === "type") {
    list.sort(
      withDir((a, b) => {
        const t = typeOf(a).localeCompare(typeOf(b))
        return t !== 0 ? t : nameCompare(a.name, b.name)
      }, dir)
    )
  } else {
    list.sort(withDir((a, b) => nameCompare(a.name, b.name), dir))
  }
  return list
}
