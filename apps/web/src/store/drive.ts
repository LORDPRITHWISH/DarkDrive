import { create } from "zustand"
import { apiGet, apiJson, apiUpload } from "@/lib/api"
import { getSocket } from "@/lib/socket"
import type {
  Breadcrumb,
  FileItem,
  Folder,
  PublicSpace,
  Space,
} from "@/lib/types"
import { useMe } from "./me"
import { toast } from "./toast"
import type { UploadEntry } from "@/lib/dropEntries"

const DEFAULT_CHUNK_SIZE = 25 * 1024 * 1024

// Accepts a plain file list (flat upload) or entries carrying a relative
// path (folder upload / folder drag-and-drop), and normalizes to entries.
function normalizeUploadEntries(input: FileList | File[] | UploadEntry[]): UploadEntry[] {
  const arr = Array.isArray(input) ? input : Array.from(input)
  return arr.map((x) => {
    if (x && typeof x === "object" && "file" in x && "relativePath" in x) {
      return x as UploadEntry
    }
    const file = x as File
    const relativePath = file.webkitRelativePath || file.name
    return { file, relativePath }
  })
}

// Resolves the folder a relative path's file should land in, creating any
// missing subfolders along the way. Paths sharing a prefix reuse the same
// in-flight creation request instead of racing duplicate POSTs.
function makeFolderResolver(rootFolderId: string) {
  const cache = new Map<string, Promise<string>>()
  cache.set("", Promise.resolve(rootFolderId))

  function resolve(dirPath: string): Promise<string> {
    const cached = cache.get(dirPath)
    if (cached) return cached
    const idx = dirPath.lastIndexOf("/")
    const parentPath = idx === -1 ? "" : dirPath.slice(0, idx)
    const name = idx === -1 ? dirPath : dirPath.slice(idx + 1)
    const promise = resolve(parentPath).then(async (parentId) => {
      const folder = await apiJson<Folder>("/api/folders", "POST", {
        name,
        parentId,
      })
      return folder.id
    })
    cache.set(dirPath, promise)
    return promise
  }

  return resolve
}

async function uploadFileChunked(
  file: File,
  onProgress: (loaded: number) => void,
  target: { folderId: string } | { replaceFileId: string }
) {
  const init = await apiJson<{ uploadId: string; chunkSize: number }>(
    "/api/files/upload/init",
    "POST",
    { ...target, name: file.name, size: file.size, mimeType: file.type || undefined }
  )
  const chunkSize = init.chunkSize || DEFAULT_CHUNK_SIZE
  const total = Math.max(1, Math.ceil(file.size / chunkSize))
  let sent = 0
  try {
    for (let i = 0; i < total; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const blob = file.slice(start, end)
      const form = new FormData()
      form.append("chunkIndex", String(i))
      form.append("chunk", blob, `${i}`)
      const chunkStart = sent
      await apiUpload(`/api/files/upload/${init.uploadId}/chunk`, form, (pct) => {
        onProgress(chunkStart + (pct / 100) * (end - start))
      })
      sent += end - start
      onProgress(sent)
    }
    await apiJson(`/api/files/upload/${init.uploadId}/complete`, "POST", {
      totalChunks: total,
    })
  } catch (e) {
    // Best-effort abort so the server can drop tmp chunks immediately rather
    // than waiting for the TTL sweep.
    try {
      await apiJson(`/api/files/upload/${init.uploadId}`, "DELETE")
    } catch {}
    throw e
  }
}

type ContentsResponse = {
  folder: Folder
  folders: Folder[]
  files: FileItem[]
  breadcrumbs: Breadcrumb[]
}

export type SortKey = "name" | "size" | "modified" | "type"
export type SortDir = "asc" | "desc"
export type SortState = { key: SortKey; dir: SortDir }

const DEFAULT_SORT: SortState = { key: "name", dir: "asc" }

export const ZOOM_MIN = 50
export const ZOOM_MAX = 200
export const ZOOM_DEFAULT = 100

const BASE_MIN_WIDTH = 170
const BASE_ICON_SIZE = 72
const ZOOM_STORAGE_KEY = "dd.zoom"

export function zoomToGrid(zoom: number) {
  const scale = zoom / 100
  return {
    minWidth: Math.round(BASE_MIN_WIDTH * scale),
    iconSize: Math.round(BASE_ICON_SIZE * scale),
  }
}

function readZoom(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_STORAGE_KEY))
    if (v >= ZOOM_MIN && v <= ZOOM_MAX) return v
  } catch {}
  return ZOOM_DEFAULT
}

function writeZoom(level: number) {
  try {
    localStorage.setItem(ZOOM_STORAGE_KEY, String(level))
  } catch {}
}

function sortStorageKey(folderId: string) {
  return `dd.sort.${folderId}`
}

function readSort(folderId: string): SortState {
  try {
    const raw = localStorage.getItem(sortStorageKey(folderId))
    if (!raw) return DEFAULT_SORT
    const parsed = JSON.parse(raw) as SortState
    if (
      (parsed.key === "name" ||
        parsed.key === "size" ||
        parsed.key === "modified" ||
        parsed.key === "type") &&
      (parsed.dir === "asc" || parsed.dir === "desc")
    )
      return parsed
  } catch {}
  return DEFAULT_SORT
}

function writeSort(folderId: string, sort: SortState) {
  try {
    localStorage.setItem(sortStorageKey(folderId), JSON.stringify(sort))
  } catch {}
}

type DriveState = {
  currentFolderId: string | null
  folder: Folder | null
  folders: Folder[]
  files: FileItem[]
  breadcrumbs: Breadcrumb[]
  loading: boolean
  error: string | null
  showHidden: boolean
  view: "grid" | "list"
  selection: Set<string>
  selectionAnchor: string | null
  spaces: Space[]
  publicSpaces: PublicSpace[]
  sort: SortState
  zoom: number
  preview: FileItem | null
  uploads: {
    id: string
    name: string
    size: number
    loaded: number
    progress: number
    speed: number
    done: boolean
    error?: string
    // Set for URL imports — the server does the downloading, so there's no
    // byte-level progress to report, just "still going" vs "done".
    indeterminate?: boolean
    // "files" counts extracted entries instead of bytes — set for zip
    // extraction, where loaded/size are entry counts, not byte counts.
    unit?: "bytes" | "files"
  }[]

  setView: (v: "grid" | "list") => void
  toggleHidden: () => void
  setSort: (sort: SortState) => void
  setZoom: (level: number) => void
  setPreview: (file: FileItem | null) => void
  select: (id: string, multi?: boolean) => void
  selectRange: (id: string, orderedIds: string[]) => void
  selectAll: (orderedIds: string[]) => void
  clearSelection: () => void

  loadFolder: (id: string) => Promise<void>
  refresh: () => Promise<void>

  createFolder: (name: string, color?: string | null, thumbnail?: File | null) => Promise<void>
  renameFolder: (id: string, name: string) => Promise<void>
  recolorFolder: (id: string, color: string | null) => Promise<void>
  renameFile: (id: string, name: string) => Promise<void>
  setFileTags: (id: string, tags: string[]) => Promise<void>
  extractZip: (id: string, name: string) => Promise<void>
  toggleHiddenItem: (type: "folder" | "file", id: string) => Promise<void>
  toggleStarred: (type: "folder" | "file", id: string) => Promise<void>
  trashItem: (type: "folder" | "file", id: string) => Promise<void>
  trashItems: (items: { type: "folder" | "file"; id: string }[]) => Promise<void>
  restoreItem: (type: "folder" | "file", id: string) => Promise<void>
  deleteItem: (type: "folder" | "file", id: string) => Promise<void>
  removeShortcut: (shortcutId: string) => Promise<void>
  addFileToSpace: (fileId: string, targetFolderId: string) => Promise<void>
  addFolderToSpace: (folderId: string, targetFolderId: string) => Promise<void>
  addItemsToSpace: (
    items: { type: "folder" | "file"; id: string }[],
    targetFolderId: string
  ) => Promise<void>
  moveItems: (
    items: { type: "folder" | "file"; id: string }[],
    targetFolderId: string
  ) => Promise<void>
  setStarred: (
    items: { type: "folder" | "file"; id: string }[],
    starred: boolean
  ) => Promise<void>
  upload: (
    files: FileList | File[] | UploadEntry[],
    explicitTargetId?: string
  ) => Promise<void>
  replaceFile: (fileId: string, file: File) => Promise<void>
  importUrl: (url: string, name?: string, explicitTargetId?: string) => Promise<void>

  loadSpaces: () => Promise<void>
  loadPublicSpaces: () => Promise<void>
  createSpace: (
    name: string,
    opts?: {
      color?: string | null
      logoKey?: string | null
      icon?: string | null
    }
  ) => Promise<Space>
  updateSpace: (
    spaceId: string,
    patch: {
      name?: string
      color?: string | null
      logoKey?: string | null
      icon?: string | null
      isPublic?: boolean
    }
  ) => Promise<void>
  addMember: (spaceId: string, email: string, role?: "VIEWER" | "EDITOR") => Promise<void>
  updateMemberRole: (spaceId: string, userId: string, role: "VIEWER" | "EDITOR") => Promise<void>
  removeMember: (spaceId: string, userId: string) => Promise<void>
  deleteSpace: (spaceId: string) => Promise<void>
  joinSpace: (spaceId: string) => Promise<void>
  leaveSpace: (spaceId: string) => Promise<void>
  togglePinSpace: (spaceId: string, pinned: boolean) => Promise<void>
  requestEditorAccess: (spaceId: string) => Promise<void>
  denyEditorRequest: (spaceId: string, userId: string) => Promise<void>
}

export const useDrive = create<DriveState>((set, get) => ({
  currentFolderId: null,
  folder: null,
  folders: [],
  files: [],
  breadcrumbs: [],
  loading: false,
  error: null,
  showHidden: false,
  view: "grid",
  selection: new Set(),
  selectionAnchor: null,
  spaces: [],
  publicSpaces: [],
  sort: DEFAULT_SORT,
  zoom: readZoom(),
  preview: null,
  uploads: [],

  setView: (v) => set({ view: v }),
  toggleHidden: () => {
    set({ showHidden: !get().showHidden })
    void get().refresh()
  },
  setSort: (sort) => {
    set({ sort })
    const id = get().currentFolderId
    if (id) writeSort(id, sort)
  },
  setZoom: (level) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(level, ZOOM_MAX))
    set({ zoom: clamped })
    writeZoom(clamped)
  },
  setPreview: (file) => set({ preview: file }),
  select: (id, multi) => {
    const cur = new Set(get().selection)
    if (multi) cur.has(id) ? cur.delete(id) : cur.add(id)
    else {
      cur.clear()
      cur.add(id)
    }
    set({ selection: cur, selectionAnchor: id })
  },
  // Shift-click range select: spans from the last non-range anchor to the
  // clicked item along the on-screen order. The anchor itself doesn't move,
  // so repeated shift-clicks grow/shrink the range from the same start.
  selectRange: (id, orderedIds) => {
    const anchor = get().selectionAnchor ?? id
    const a = orderedIds.indexOf(anchor)
    const b = orderedIds.indexOf(id)
    if (a === -1 || b === -1) {
      get().select(id)
      return
    }
    const [lo, hi] = a < b ? [a, b] : [b, a]
    set({ selection: new Set(orderedIds.slice(lo, hi + 1)) })
  },
  selectAll: (orderedIds) => set({ selection: new Set(orderedIds) }),
  clearSelection: () => set({ selection: new Set(), selectionAnchor: null }),

  loadFolder: async (id: string) => {
    set({
      loading: true,
      error: null,
      currentFolderId: id,
      selection: new Set(),
      selectionAnchor: null,
      // Pick up the persisted sort for this folder so each folder remembers
      // its own preferred ordering.
      sort: readSort(id),
    })
    try {
      const q = new URLSearchParams()
      if (get().showHidden) q.set("includeHidden", "1")
      const data = await apiGet<ContentsResponse>(`/api/folders/${id}/contents?${q.toString()}`)
      set({
        folder: data.folder,
        folders: data.folders,
        files: data.files,
        breadcrumbs: data.breadcrumbs,
        loading: false,
      })
    } catch (e: any) {
      set({ loading: false, error: e.message })
    }
  },
  refresh: async () => {
    const id = get().currentFolderId
    if (id) await get().loadFolder(id)
  },

  createFolder: async (name, color, thumbnail) => {
    const parentId = get().currentFolderId
    if (!parentId) return
    const folder = await apiJson<Folder>("/api/folders", "POST", { name, parentId, color: color ?? null })
    if (thumbnail) {
      const form = new FormData()
      form.append("thumbnail", thumbnail)
      await apiUpload(`/api/folders/${folder.id}/thumbnail`, form)
    }
    await get().refresh()
  },
  renameFolder: async (id, name) => {
    await apiJson(`/api/folders/${id}`, "PATCH", { name })
    await get().refresh()
  },
  recolorFolder: async (id, color) => {
    await apiJson(`/api/folders/${id}`, "PATCH", { color })
    await get().refresh()
  },
  renameFile: async (id, name) => {
    await apiJson(`/api/files/${id}`, "PATCH", { name })
    await get().refresh()
  },
  setFileTags: async (id, tags) => {
    await apiJson(`/api/files/${id}`, "PATCH", { tags })
    await get().refresh()
  },
  extractZip: async (id, name) => {
    const folderId = get().currentFolderId
    if (!folderId) return
    const uid = crypto.randomUUID()
    set({
      uploads: [
        ...get().uploads,
        {
          id: uid,
          name,
          size: 0,
          loaded: 0,
          progress: 0,
          speed: 0,
          done: false,
          indeterminate: true,
          unit: "files",
        },
      ],
    })

    // Extraction runs server-side, so progress comes over the socket as
    // entries land — same relay as importUrl's "import:progress" above.
    const socket = getSocket()
    const onProgress = (p: { clientId: string; extracted: number; total: number }) => {
      if (p.clientId !== uid) return
      const progress = p.total ? (p.extracted / p.total) * 100 : 0
      set({
        uploads: get().uploads.map((u) =>
          u.id === uid
            ? { ...u, loaded: p.extracted, size: p.total, progress, indeterminate: false }
            : u
        ),
      })
    }
    socket.on("extract:progress", onProgress)

    try {
      await apiJson(`/api/files/${id}/extract`, "POST", { folderId, clientId: uid })
      set({
        uploads: get().uploads.map((u) =>
          u.id === uid
            ? { ...u, progress: 100, loaded: u.size || u.loaded, done: true, indeterminate: false }
            : u
        ),
      })
      await get().refresh()
    } catch (e: any) {
      set({
        uploads: get().uploads.map((u) =>
          u.id === uid ? { ...u, error: e?.body?.error || e?.message, done: true } : u
        ),
      })
    } finally {
      socket.off("extract:progress", onProgress)
      // only this item, only after it's actually done — never clears a
      // still-in-progress neighbor in the tracker
      setTimeout(() => set({ uploads: get().uploads.filter((u) => u.id !== uid) }), 5000)
    }
  },
  toggleHiddenItem: async (type, id) => {
    const list = type === "folder" ? get().folders : get().files
    const item = list.find((x) => x.id === id)
    if (!item) return
    await apiJson(`/api/${type === "folder" ? "folders" : "files"}/${id}`, "PATCH", {
      isHidden: !item.isHidden,
    })
    await get().refresh()
  },
  toggleStarred: async (type, id) => {
    const list = type === "folder" ? get().folders : get().files
    const item = list.find((x) => x.id === id)
    if (!item) return
    await apiJson(`/api/${type === "folder" ? "folders" : "files"}/${id}`, "PATCH", {
      isStarred: !item.isStarred,
    })
    await get().refresh()
  },
  trashItem: async (type, id) => {
    // Capture the item's name before it's refreshed out of the list, so the
    // undo toast can show a meaningful label.
    const list = type === "folder" ? get().folders : get().files
    const name = list.find((x) => x.id === id)?.name
    try {
      await apiJson(
        `/api/${type === "folder" ? "folders" : "files"}/${id}`,
        "PATCH",
        { isTrashed: true }
      )
      await get().refresh()
      const label = name ? `"${name}"` : type === "folder" ? "Folder" : "File"
      toast.action(`${label} moved to bin`, {
        label: "Undo",
        onClick: () => get().restoreItem(type, id),
      })
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Couldn't move to bin."
      )
      throw e
    }
  },
  trashItems: async (items) => {
    if (items.length === 0) return
    if (items.length === 1) {
      const [only] = items
      await get().trashItem(only.type, only.id)
      return
    }
    const results = await Promise.allSettled(
      items.map((item) =>
        apiJson(
          `/api/${item.type === "folder" ? "folders" : "files"}/${item.id}`,
          "PATCH",
          { isTrashed: true }
        )
      )
    )
    const succeeded = items.filter((_, i) => results[i]!.status === "fulfilled")
    const failed = items.length - succeeded.length
    await get().refresh()
    // One combined "Undo" toast for the whole batch, rather than firing one
    // toast per item — restores everything that made it into the bin.
    if (succeeded.length > 0) {
      toast.action(`${succeeded.length} items moved to bin`, {
        label: "Undo",
        onClick: () => {
          for (const it of succeeded) void get().restoreItem(it.type, it.id)
        },
      })
    }
    if (failed > 0) {
      toast.error(
        succeeded.length > 0
          ? `${failed} of ${items.length} couldn't be moved to bin.`
          : "Couldn't move items to bin."
      )
    }
  },
  restoreItem: async (type, id) => {
    try {
      await apiJson(
        `/api/${type === "folder" ? "folders" : "files"}/${id}`,
        "PATCH",
        { isTrashed: false }
      )
      await get().refresh()
      toast.success("Restored.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't restore.")
      throw e
    }
  },
  deleteItem: async (type, id) => {
    try {
      await apiJson(
        `/api/${type === "folder" ? "folders" : "files"}/${id}`,
        "DELETE"
      )
      await get().refresh()
      toast.success(`${type === "folder" ? "Folder" : "File"} deleted.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete.")
      throw e
    }
  },
  removeShortcut: async (shortcutId) => {
    await apiJson(`/api/files/shortcuts/${shortcutId}`, "DELETE")
    await get().refresh()
  },
  addFileToSpace: async (fileId, targetFolderId) => {
    await apiJson(`/api/files/${fileId}/shortcut`, "POST", { targetFolderId })
    await get().refresh()
  },
  addFolderToSpace: async (folderId, targetFolderId) => {
    await apiJson(`/api/folders/${folderId}/mirror`, "POST", { targetFolderId })
    await get().refresh()
  },
  addItemsToSpace: async (items, targetFolderId) => {
    if (items.length === 0) return
    const results = await Promise.allSettled(
      items.map((item) =>
        item.type === "file"
          ? apiJson(`/api/files/${item.id}/shortcut`, "POST", { targetFolderId })
          : apiJson(`/api/folders/${item.id}/mirror`, "POST", { targetFolderId })
      )
    )
    const failed = results.filter((r) => r.status === "rejected").length
    await get().refresh()
    if (failed > 0) {
      toast.error(
        items.length === 1
          ? "Couldn't add to space."
          : `Added ${items.length - failed} of ${items.length} — ${failed} failed.`
      )
    } else if (items.length > 1) {
      toast.success(`Added ${items.length} items to space.`)
    }
  },
  moveItems: async (items, targetFolderId) => {
    if (items.length === 0) return
    const results = await Promise.allSettled(
      items.map((item) =>
        item.type === "folder"
          ? apiJson(`/api/folders/${item.id}`, "PATCH", { parentId: targetFolderId })
          : apiJson(`/api/files/${item.id}`, "PATCH", { folderId: targetFolderId })
      )
    )
    const failed = results.filter((r) => r.status === "rejected").length
    get().clearSelection()
    await get().refresh()
    if (failed > 0) {
      toast.error(
        items.length === 1
          ? "Couldn't move item."
          : `Moved ${items.length - failed} of ${items.length} — ${failed} failed.`
      )
    } else if (items.length > 1) {
      toast.success(`Moved ${items.length} items.`)
    }
  },
  setStarred: async (items, starred) => {
    if (items.length === 0) return
    const results = await Promise.allSettled(
      items.map((item) =>
        apiJson(
          `/api/${item.type === "folder" ? "folders" : "files"}/${item.id}`,
          "PATCH",
          { isStarred: starred }
        )
      )
    )
    const failed = results.filter((r) => r.status === "rejected").length
    await get().refresh()
    if (failed > 0) {
      toast.error(
        items.length === 1
          ? "Couldn't update star."
          : `Updated ${items.length - failed} of ${items.length} — ${failed} failed.`
      )
    }
  },

  upload: async (files, explicitTargetId) => {
    const rootFolderId = explicitTargetId ?? get().currentFolderId
    if (!rootFolderId) return
    const list = normalizeUploadEntries(files)
    const resolveFolder = makeFolderResolver(rootFolderId)

    for (const { file, relativePath } of list) {
      const uid = crypto.randomUUID()
      set({
        uploads: [
          ...get().uploads,
          {
            id: uid,
            name: relativePath,
            size: file.size,
            loaded: 0,
            progress: 0,
            speed: 0,
            done: false,
          },
        ],
      })
      // Rolling window for speed estimation — keeps ~2s of samples so bursts
      // and network jitter don't dominate the reported rate.
      const samples: { t: number; loaded: number }[] = [
        { t: performance.now(), loaded: 0 },
      ]
      try {
        const dirIdx = relativePath.lastIndexOf("/")
        const dirPath = dirIdx === -1 ? "" : relativePath.slice(0, dirIdx)
        const folderId = await resolveFolder(dirPath)
        await uploadFileChunked(file, (loaded) => {
          const now = performance.now()
          samples.push({ t: now, loaded })
          while (samples.length > 2 && now - samples[0].t > 2000) samples.shift()
          const first = samples[0]
          const last = samples[samples.length - 1]
          const dt = (last.t - first.t) / 1000
          const speed = dt > 0 ? (last.loaded - first.loaded) / dt : 0
          const progress = file.size > 0 ? (loaded / file.size) * 100 : 100
          set({
            uploads: get().uploads.map((u) =>
              u.id === uid ? { ...u, loaded, progress, speed } : u
            ),
          })
        }, { folderId })
        set({
          uploads: get().uploads.map((u) =>
            u.id === uid
              ? { ...u, loaded: file.size, progress: 100, speed: 0, done: true }
              : u
          ),
        })
      } catch (e: any) {
        set({
          uploads: get().uploads.map((u) =>
            u.id === uid ? { ...u, error: e.message, speed: 0, done: true } : u
          ),
        })
      }
      // clear this item 5s after it finishes, independent of the rest of the queue
      setTimeout(() => set({ uploads: get().uploads.filter((u) => u.id !== uid) }), 5000)
    }
    await get().refresh()
    void useMe.getState().loadQuota()
  },

  // Uploads `file`'s bytes as a new version of an existing file, archiving
  // the current content into its version history instead of creating a
  // sibling file. Same chunked transport and toaster entry as a normal
  // upload, just routed through replaceFileId.
  replaceFile: async (fileId, file) => {
    const uid = crypto.randomUUID()
    set({
      uploads: [
        ...get().uploads,
        { id: uid, name: file.name, size: file.size, loaded: 0, progress: 0, speed: 0, done: false },
      ],
    })
    const samples: { t: number; loaded: number }[] = [{ t: performance.now(), loaded: 0 }]
    try {
      await uploadFileChunked(
        file,
        (loaded) => {
          const now = performance.now()
          samples.push({ t: now, loaded })
          while (samples.length > 2 && now - samples[0].t > 2000) samples.shift()
          const first = samples[0]
          const last = samples[samples.length - 1]
          const dt = (last.t - first.t) / 1000
          const speed = dt > 0 ? (last.loaded - first.loaded) / dt : 0
          const progress = file.size > 0 ? (loaded / file.size) * 100 : 100
          set({
            uploads: get().uploads.map((u) =>
              u.id === uid ? { ...u, loaded, progress, speed } : u
            ),
          })
        },
        { replaceFileId: fileId }
      )
      set({
        uploads: get().uploads.map((u) =>
          u.id === uid ? { ...u, loaded: file.size, progress: 100, speed: 0, done: true } : u
        ),
      })
    } catch (e: any) {
      set({
        uploads: get().uploads.map((u) =>
          u.id === uid ? { ...u, error: e.message, speed: 0, done: true } : u
        ),
      })
      throw e
    } finally {
      setTimeout(() => set({ uploads: get().uploads.filter((u) => u.id !== uid) }), 5000)
    }
    await get().refresh()
    void useMe.getState().loadQuota()
  },

  importUrl: async (url, name, explicitTargetId) => {
    const folderId = explicitTargetId ?? get().currentFolderId
    if (!folderId) return
    const uid = crypto.randomUUID()
    set({
      uploads: [
        ...get().uploads,
        {
          id: uid,
          name: name?.trim() || url,
          size: 0,
          loaded: 0,
          progress: 0,
          speed: 0,
          done: false,
          indeterminate: true,
        },
      ],
    })

    // The download runs server-side, so progress comes over the socket
    // instead of XHR's upload.onprogress — same rolling-window speed calc
    // as uploadFileChunked above, just fed by "import:progress" events.
    const socket = getSocket()
    const samples: { t: number; loaded: number }[] = [{ t: performance.now(), loaded: 0 }]
    const onProgress = (p: {
      clientId: string
      received: number
      total: number | null
      name?: string
    }) => {
      if (p.clientId !== uid) return
      const now = performance.now()
      samples.push({ t: now, loaded: p.received })
      while (samples.length > 2 && now - samples[0].t > 2000) samples.shift()
      const first = samples[0]
      const last = samples[samples.length - 1]
      const dt = (last.t - first.t) / 1000
      const speed = dt > 0 ? (last.loaded - first.loaded) / dt : 0
      const progress = p.total ? (p.received / p.total) * 100 : 0
      set({
        uploads: get().uploads.map((u) =>
          u.id === uid
            ? {
                ...u,
                // Server resolves the real filename (Content-Disposition,
                // URL, or mime type) once headers are in — swap the raw URL
                // placeholder for it as soon as it's known.
                name: p.name?.trim() || u.name,
                loaded: p.received,
                size: p.total ?? u.size,
                progress,
                speed,
                indeterminate: p.total == null,
              }
            : u
        ),
      })
    }
    socket.on("import:progress", onProgress)

    try {
      const res = await apiJson<{ file: { name: string } }>("/api/files/import-url", "POST", {
        folderId,
        url,
        name: name?.trim() || undefined,
        clientId: uid,
      })
      set({
        uploads: get().uploads.map((u) =>
          u.id === uid
            ? {
                ...u,
                name: res.file.name,
                progress: 100,
                loaded: u.size || u.loaded,
                speed: 0,
                done: true,
                indeterminate: false,
              }
            : u
        ),
      })
      await get().refresh()
      void useMe.getState().loadQuota()
    } catch (e: any) {
      set({
        uploads: get().uploads.map((u) =>
          u.id === uid ? { ...u, error: e?.body?.error || e?.message, done: true, speed: 0 } : u
        ),
      })
    } finally {
      socket.off("import:progress", onProgress)
      setTimeout(() => set({ uploads: get().uploads.filter((u) => u.id !== uid) }), 5000)
    }
  },

  loadSpaces: async () => {
    const data = await apiGet<{ spaces: Space[] }>("/api/spaces")
    set({ spaces: data.spaces })
  },
  loadPublicSpaces: async () => {
    const data = await apiGet<{ spaces: PublicSpace[] }>("/api/spaces/public")
    set({ publicSpaces: data.spaces })
  },
  createSpace: async (name, opts) => {
    try {
      const s = await apiJson<Space>("/api/spaces", "POST", {
        name,
        color: opts?.color ?? null,
        logoKey: opts?.logoKey ?? null,
        icon: opts?.icon ?? null,
      })
      await get().loadSpaces()
      toast.success(`Space "${name}" created.`)
      return s
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create space.")
      throw e
    }
  },
  updateSpace: async (spaceId, patch) => {
    try {
      await apiJson(`/api/spaces/${spaceId}`, "PATCH", patch)
      await get().loadSpaces()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update space.")
      throw e
    }
  },
  addMember: async (spaceId, email, role = "EDITOR") => {
    try {
      await apiJson(`/api/spaces/${spaceId}/members`, "POST", { email, role })
      await get().loadSpaces()
      toast.success(`Invited ${email}.`)
    } catch (e) {
      // Let the dialog surface field-level errors (user_not_found, etc.) —
      // rethrow so the caller's catch can decide. No toast on known errors.
      throw e
    }
  },
  updateMemberRole: async (spaceId, userId, role) => {
    await apiJson(`/api/spaces/${spaceId}/members/${userId}`, "PATCH", { role })
    await get().loadSpaces()
  },
  removeMember: async (spaceId, userId) => {
    await apiJson(`/api/spaces/${spaceId}/members/${userId}`, "DELETE")
    await get().loadSpaces()
  },
  deleteSpace: async (spaceId) => {
    try {
      await apiJson(`/api/spaces/${spaceId}`, "DELETE")
      await get().loadSpaces()
      toast.success("Space deleted.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete space.")
      throw e
    }
  },
  joinSpace: async (spaceId) => {
    try {
      await apiJson(`/api/spaces/${spaceId}/join`, "POST")
      await Promise.all([get().loadSpaces(), get().loadPublicSpaces()])
      toast.success("Joined space.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't join space.")
      throw e
    }
  },
  leaveSpace: async (spaceId) => {
    try {
      await apiJson(`/api/spaces/${spaceId}/leave`, "POST")
      await Promise.all([get().loadSpaces(), get().loadPublicSpaces()])
      toast.success("Left space.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't leave space.")
      throw e
    }
  },
  togglePinSpace: async (spaceId, pinned) => {
    try {
      await apiJson(`/api/spaces/${spaceId}/pin`, "PATCH", { pinned })
      await get().loadSpaces()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update pin.")
      throw e
    }
  },
  requestEditorAccess: async (spaceId) => {
    try {
      await apiJson(`/api/spaces/${spaceId}/request-editor`, "POST")
      await get().loadSpaces()
      toast.success("Upload access requested.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send request.")
      throw e
    }
  },
  denyEditorRequest: async (spaceId, userId) => {
    await apiJson(`/api/spaces/${spaceId}/members/${userId}/deny-editor`, "POST")
    await get().loadSpaces()
  },
}))
