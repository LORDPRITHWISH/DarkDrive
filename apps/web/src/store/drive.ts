import { create } from "zustand"
import { apiGet, apiJson, apiUpload } from "@/lib/api"
import type {
  Breadcrumb,
  FileItem,
  Folder,
  PublicSpace,
  Space,
} from "@/lib/types"
import { useMe } from "./me"

const DEFAULT_CHUNK_SIZE = 25 * 1024 * 1024

async function uploadFileChunked(
  folderId: string,
  file: File,
  onProgress: (loaded: number) => void
) {
  const init = await apiJson<{ uploadId: string; chunkSize: number }>(
    "/api/files/upload/init",
    "POST",
    { folderId, name: file.name, size: file.size, mimeType: file.type || undefined }
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
  spaces: Space[]
  publicSpaces: PublicSpace[]
  uploads: {
    id: string
    name: string
    size: number
    loaded: number
    progress: number
    speed: number
    done: boolean
    error?: string
  }[]

  setView: (v: "grid" | "list") => void
  toggleHidden: () => void
  select: (id: string, multi?: boolean) => void
  clearSelection: () => void

  loadFolder: (id: string) => Promise<void>
  refresh: () => Promise<void>

  createFolder: (name: string, color?: string | null) => Promise<void>
  renameFolder: (id: string, name: string) => Promise<void>
  recolorFolder: (id: string, color: string | null) => Promise<void>
  renameFile: (id: string, name: string) => Promise<void>
  toggleHiddenItem: (type: "folder" | "file", id: string) => Promise<void>
  toggleStarred: (type: "folder" | "file", id: string) => Promise<void>
  trashItem: (type: "folder" | "file", id: string) => Promise<void>
  restoreItem: (type: "folder" | "file", id: string) => Promise<void>
  deleteItem: (type: "folder" | "file", id: string) => Promise<void>
  removeShortcut: (shortcutId: string) => Promise<void>
  addFileToSpace: (fileId: string, targetFolderId: string) => Promise<void>
  addFolderToSpace: (folderId: string, targetFolderId: string) => Promise<void>
  moveItem: (type: "folder" | "file", id: string, targetFolderId: string) => Promise<void>
  upload: (files: FileList | File[], explicitTargetId?: string) => Promise<void>

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
  spaces: [],
  publicSpaces: [],
  uploads: [],

  setView: (v) => set({ view: v }),
  toggleHidden: () => {
    set({ showHidden: !get().showHidden })
    void get().refresh()
  },
  select: (id, multi) => {
    const cur = new Set(get().selection)
    if (multi) cur.has(id) ? cur.delete(id) : cur.add(id)
    else {
      cur.clear()
      cur.add(id)
    }
    set({ selection: cur })
  },
  clearSelection: () => set({ selection: new Set() }),

  loadFolder: async (id: string) => {
    set({ loading: true, error: null, currentFolderId: id, selection: new Set() })
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

  createFolder: async (name, color) => {
    const parentId = get().currentFolderId
    if (!parentId) return
    await apiJson("/api/folders", "POST", { name, parentId, color: color ?? null })
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
    await apiJson(`/api/${type === "folder" ? "folders" : "files"}/${id}`, "PATCH", {
      isTrashed: true,
    })
    await get().refresh()
  },
  restoreItem: async (type, id) => {
    await apiJson(`/api/${type === "folder" ? "folders" : "files"}/${id}`, "PATCH", {
      isTrashed: false,
    })
    await get().refresh()
  },
  deleteItem: async (type, id) => {
    await apiJson(`/api/${type === "folder" ? "folders" : "files"}/${id}`, "DELETE")
    await get().refresh()
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
  moveItem: async (type, id, targetFolderId) => {
    if (type === "folder") {
      await apiJson(`/api/folders/${id}`, "PATCH", { parentId: targetFolderId })
    } else {
      await apiJson(`/api/files/${id}`, "PATCH", { folderId: targetFolderId })
    }
    await get().refresh()
  },

  upload: async (files, explicitTargetId) => {
    const folderId = explicitTargetId ?? get().currentFolderId
    if (!folderId) return
    const list = Array.from(files)

    for (const file of list) {
      const uid = crypto.randomUUID()
      set({
        uploads: [
          ...get().uploads,
          {
            id: uid,
            name: file.name,
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
        await uploadFileChunked(folderId, file, (loaded) => {
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
        })
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
    }
    await get().refresh()
    void useMe.getState().loadQuota()
    // auto-clear after a short delay
    setTimeout(() => set({ uploads: get().uploads.filter((u) => !u.done) }), 4000)
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
    const s = await apiJson<Space>("/api/spaces", "POST", {
      name,
      color: opts?.color ?? null,
      logoKey: opts?.logoKey ?? null,
      icon: opts?.icon ?? null,
    })
    await get().loadSpaces()
    return s
  },
  updateSpace: async (spaceId, patch) => {
    await apiJson(`/api/spaces/${spaceId}`, "PATCH", patch)
    await get().loadSpaces()
  },
  addMember: async (spaceId, email, role = "EDITOR") => {
    await apiJson(`/api/spaces/${spaceId}/members`, "POST", { email, role })
    await get().loadSpaces()
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
    await apiJson(`/api/spaces/${spaceId}`, "DELETE")
    await get().loadSpaces()
  },
}))
