// Flattens a drag-and-drop DataTransfer into files with their relative path,
// so a folder dragged in from the OS file explorer keeps its subfolder
// structure instead of collapsing into a flat file list.
export type UploadEntry = { file: File; relativePath: string }

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    // readEntries() may not return every child in one call for large
    // directories — the spec requires calling it repeatedly until empty.
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all)
        } else {
          all.push(...batch)
          readBatch()
        }
      }, reject)
    }
    readBatch()
  })
}

async function walk(entry: FileSystemEntry, prefix: string, out: UploadEntry[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject)
    )
    out.push({ file, relativePath: `${prefix}${entry.name}` })
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const children = await readAllEntries(reader)
    for (const child of children) {
      await walk(child, `${prefix}${entry.name}/`, out)
    }
  }
}

export async function entriesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<UploadEntry[]> {
  const items = Array.from(dataTransfer.items)
  const entries = items
    .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => !!e)

  // Fallback for browsers without webkitGetAsEntry — flat files only.
  if (entries.length === 0) {
    return Array.from(dataTransfer.files).map((file) => ({
      file,
      relativePath: file.name,
    }))
  }

  const out: UploadEntry[] = []
  for (const entry of entries) {
    await walk(entry, "", out)
  }
  return out
}
