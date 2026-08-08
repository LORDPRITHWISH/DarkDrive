import { create } from "zustand"
import { apiGet, apiJson } from "@/lib/api"
import type { NavState, QuotaInfo, RecentFile, FileItem, Folder } from "@/lib/types"

type MeState = {
  quota: QuotaInfo | null
  recent: RecentFile[]
  recentlyAdded: FileItem[]
  suggestions: FileItem[]
  folderSuggestions: Folder[]
  uploadHistory: FileItem[]
  uploadHistoryCursor: string | null
  uploadHistoryLoading: boolean
  nav: NavState | null

  loadQuota: () => Promise<void>
  loadRecent: (limit?: number) => Promise<void>
  loadRecentlyAdded: (limit?: number) => Promise<void>
  dismissRecentlyAdded: (fileId: string) => void
  loadUploadHistory: (opts?: { more?: boolean }) => Promise<void>
  loadSuggestions: (limit?: number) => Promise<void>
  loadFolderSuggestions: (limit?: number) => Promise<void>
  requestUpgrade: (bytes: number) => Promise<void>

  loadNav: () => Promise<void>
  pushNav: (path: string) => Promise<NavState>
  backNav: () => Promise<NavState>
  forwardNav: () => Promise<NavState>
}

export const useMe = create<MeState>((set, get) => ({
  quota: null,
  recent: [],
  recentlyAdded: [],
  suggestions: [],
  folderSuggestions: [],
  uploadHistory: [],
  uploadHistoryCursor: null,
  uploadHistoryLoading: false,
  nav: null,

  loadQuota: async () => {
    const q = await apiGet<QuotaInfo>("/api/me/quota")
    set({ quota: q })
  },
  loadRecent: async (limit = 24) => {
    const r = await apiGet<{ files: RecentFile[] }>(`/api/me/recent?limit=${limit}`)
    set({ recent: r.files })
  },
  loadRecentlyAdded: async (limit = 12) => {
    const r = await apiGet<{ files: FileItem[] }>(
      `/api/me/recently-added?limit=${limit}`
    )
    set({ recentlyAdded: r.files })
  },
  dismissRecentlyAdded: (fileId) => {
    set({ recentlyAdded: get().recentlyAdded.filter((f) => f.id !== fileId) })
  },
  loadUploadHistory: async (opts) => {
    const more = opts?.more ?? false
    const cursor = more ? get().uploadHistoryCursor : null
    if (more && !cursor) return
    set({ uploadHistoryLoading: true })
    try {
      const r = await apiGet<{ files: FileItem[]; nextCursor: string | null }>(
        `/api/me/uploads?limit=50${cursor ? `&cursor=${cursor}` : ""}`
      )
      set({
        uploadHistory: more ? [...get().uploadHistory, ...r.files] : r.files,
        uploadHistoryCursor: r.nextCursor,
      })
    } finally {
      set({ uploadHistoryLoading: false })
    }
  },
  loadSuggestions: async (limit = 12) => {
    const r = await apiGet<{ files: FileItem[] }>(`/api/me/suggestions?limit=${limit}`)
    set({ suggestions: r.files })
  },
  loadFolderSuggestions: async (limit = 8) => {
    const r = await apiGet<{ folders: Folder[] }>(
      `/api/me/folder-suggestions?limit=${limit}`
    )
    set({ folderSuggestions: r.folders })
  },
  requestUpgrade: async (bytes: number) => {
    await apiJson("/api/me/request-upgrade", "POST", { bytes })
    const q = await apiGet<QuotaInfo>("/api/me/quota")
    set({ quota: q })
  },

  loadNav: async () => {
    const n = await apiGet<NavState>("/api/me/nav")
    set({ nav: n })
  },
  pushNav: async (path) => {
    const n = await apiJson<NavState>("/api/me/nav/push", "POST", { path })
    set({ nav: n })
    return n
  },
  backNav: async () => {
    const n = await apiJson<NavState>("/api/me/nav/back", "POST")
    set({ nav: n })
    return n
  },
  forwardNav: async () => {
    const n = await apiJson<NavState>("/api/me/nav/forward", "POST")
    set({ nav: n })
    return n
  },
}))
