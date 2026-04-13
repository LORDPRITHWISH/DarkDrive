import { create } from "zustand"
import { apiGet, apiJson, apiUpload } from "@/lib/api"
import type { Breadcrumb, FileItem, Folder, Space } from "@/lib/types"

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
  showTrashed: boolean
  view: "grid" | "list"
  selection: Set<string>
  spaces: Space[]
  uploads: { id: string; name: string; progress: number; done: boolean; error?: string }[]

  setView: (v: "grid" | "list") => void
  toggleHidden: () => void
  toggleTrashed: () => void
  select: (id: string, multi?: boolean) => void
  clearSelection: () => void

  loadFolder: (id: string) => Promise<void>
  refresh: () => Promise<void>

  createFolder: (name: string) => Promise<void>
  renameFolder: (id: string, name: string) => Promise<void>
  renameFile: (id: string, name: string) => Promise<void>
  toggleHiddenItem: (type: "folder" | "file", id: string) => Promise<void>
  toggleStarred: (type: "folder" | "file", id: string) => Promise<void>
  trashItem: (type: "folder" | "file", id: string) => Promise<void>
  restoreItem: (type: "folder" | "file", id: string) => Promise<void>
  deleteItem: (type: "folder" | "file", id: string) => Promise<void>
  moveItem: (type: "folder" | "file", id: string, targetFolderId: string) => Promise<void>
  upload: (files: FileList | File[]) => Promise<void>

  loadSpaces: () => Promise<void>
  createSpace: (name: string) => Promise<Space>
  addMember: (spaceId: string, email: string, role?: "VIEWER" | "EDITOR" | "ADMIN") => Promise<void>
  removeMember: (spaceId: string, userId: string) => Promise<void>
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
  showTrashed: false,
  view: "grid",
  selection: new Set(),
  spaces: [],
  uploads: [],

  setView: (v) => set({ view: v }),
  toggleHidden: () => {
    set({ showHidden: !get().showHidden })
    void get().refresh()
  },
  toggleTrashed: () => {
    set({ showTrashed: !get().showTrashed })
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
      if (get().showTrashed) q.set("includeTrashed", "1")
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

  createFolder: async (name) => {
    const parentId = get().currentFolderId
    if (!parentId) return
    await apiJson("/api/folders", "POST", { name, parentId })
    await get().refresh()
  },
  renameFolder: async (id, name) => {
    await apiJson(`/api/folders/${id}`, "PATCH", { name })
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
  moveItem: async (type, id, targetFolderId) => {
    if (type === "folder") {
      await apiJson(`/api/folders/${id}`, "PATCH", { parentId: targetFolderId })
    } else {
      await apiJson(`/api/files/${id}`, "PATCH", { folderId: targetFolderId })
    }
    await get().refresh()
  },

  upload: async (files) => {
    const folderId = get().currentFolderId
    if (!folderId) return
    const list = Array.from(files)
    const batches: File[][] = []
    const BATCH = 8
    for (let i = 0; i < list.length; i += BATCH) batches.push(list.slice(i, i + BATCH))

    for (const batch of batches) {
      const form = new FormData()
      form.append("folderId", folderId)
      for (const f of batch) form.append("files", f)
      const uid = crypto.randomUUID()
      const name = batch.map((f) => f.name).join(", ")
      set({ uploads: [...get().uploads, { id: uid, name, progress: 0, done: false }] })
      try {
        await apiUpload("/api/files/upload", form, (pct) => {
          set({
            uploads: get().uploads.map((u) => (u.id === uid ? { ...u, progress: pct } : u)),
          })
        })
        set({
          uploads: get().uploads.map((u) =>
            u.id === uid ? { ...u, progress: 100, done: true } : u
          ),
        })
      } catch (e: any) {
        set({
          uploads: get().uploads.map((u) =>
            u.id === uid ? { ...u, error: e.message, done: true } : u
          ),
        })
      }
    }
    await get().refresh()
    // auto-clear after a short delay
    setTimeout(() => set({ uploads: get().uploads.filter((u) => !u.done) }), 4000)
  },

  loadSpaces: async () => {
    const data = await apiGet<{ spaces: Space[] }>("/api/spaces")
    set({ spaces: data.spaces })
  },
  createSpace: async (name) => {
    const s = await apiJson<Space>("/api/spaces", "POST", { name })
    await get().loadSpaces()
    return s
  },
  addMember: async (spaceId, email, role = "EDITOR") => {
    await apiJson(`/api/spaces/${spaceId}/members`, "POST", { email, role })
    await get().loadSpaces()
  },
  removeMember: async (spaceId, userId) => {
    await apiJson(`/api/spaces/${spaceId}/members/${userId}`, "DELETE")
    await get().loadSpaces()
  },
}))
