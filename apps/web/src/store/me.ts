import { create } from "zustand"
import { apiGet, apiJson } from "@/lib/api"
import type { NavState, QuotaInfo, RecentFile, FileItem, Folder } from "@/lib/types"

type MeState = {
  quota: QuotaInfo | null
  recent: RecentFile[]
  suggestions: FileItem[]
  folderSuggestions: Folder[]
  nav: NavState | null

  loadQuota: () => Promise<void>
  loadRecent: (limit?: number) => Promise<void>
  loadSuggestions: (limit?: number) => Promise<void>
  loadFolderSuggestions: (limit?: number) => Promise<void>
  requestUpgrade: () => Promise<void>

  loadNav: () => Promise<void>
  pushNav: (path: string) => Promise<NavState>
  backNav: () => Promise<NavState>
  forwardNav: () => Promise<NavState>
}

export const useMe = create<MeState>((set) => ({
  quota: null,
  recent: [],
  suggestions: [],
  folderSuggestions: [],
  nav: null,

  loadQuota: async () => {
    const q = await apiGet<QuotaInfo>("/api/me/quota")
    set({ quota: q })
  },
  loadRecent: async (limit = 24) => {
    const r = await apiGet<{ files: RecentFile[] }>(`/api/me/recent?limit=${limit}`)
    set({ recent: r.files })
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
  requestUpgrade: async () => {
    await apiJson("/api/me/request-upgrade", "POST")
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
