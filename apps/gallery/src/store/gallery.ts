import { create } from "zustand"
import { apiGet, apiJson, uploadFile } from "@/lib/api"
import type { Album, Item, Me, Quota } from "@/lib/types"

export type Filter = "all" | "favorites" | "trash"

// Two at a time: enough to keep a home connection saturated without opening so
// many sockets that the progress bar stalls in the middle of every file.
const UPLOAD_CONCURRENCY = 2

export type Upload = { id: string; name: string; size: number; sent: number; error?: string }

type TimelineResponse = { photosRootId: string; items: Item[]; nextOffset: number | null }

type State = {
  me: Me | null
  meLoading: boolean
  photosRootId: string | null
  quota: Quota | null

  filter: Filter
  items: Item[]
  loading: boolean
  nextOffset: number | null

  albums: Album[]
  selected: Set<string>
  uploads: Upload[]

  fetchMe: () => Promise<void>
  logout: () => Promise<void>
  loadTimeline: (filter: Filter) => Promise<void>
  loadMore: () => Promise<void>
  refreshQuota: () => Promise<void>

  toggleSelect: (id: string) => void
  selectMany: (ids: string[]) => void
  clearSelection: () => void

  setStarred: (ids: string[], isStarred: boolean) => Promise<void>
  setTrashed: (ids: string[], isTrashed: boolean) => Promise<void>

  loadAlbums: () => Promise<void>
  createAlbum: (name: string, fileIds?: string[]) => Promise<Album | null>
  renameAlbum: (id: string, name: string) => Promise<void>
  deleteAlbum: (id: string) => Promise<void>
  addToAlbum: (albumId: string, fileIds: string[]) => Promise<void>
  removeFromAlbum: (albumId: string, fileIds: string[]) => Promise<void>

  upload: (files: File[]) => Promise<void>
}

export const useGallery = create<State>((set, get) => ({
  me: null,
  meLoading: true,
  photosRootId: null,
  quota: null,

  filter: "all",
  items: [],
  loading: false,
  nextOffset: 0,

  albums: [],
  selected: new Set(),
  uploads: [],

  async fetchMe() {
    try {
      set({ me: await apiGet<Me>("/api/auth/me"), meLoading: false })
    } catch {
      set({ me: null, meLoading: false })
    }
  },

  async logout() {
    await apiJson("/api/auth/logout", "POST").catch(() => {})
    set({ me: null, items: [], albums: [] })
  },

  async loadTimeline(filter) {
    set({ filter, loading: true, items: [], nextOffset: 0, selected: new Set() })
    const res = await apiGet<TimelineResponse>(`/api/gallery/timeline?filter=${filter}`)
    set({
      items: res.items,
      photosRootId: res.photosRootId,
      nextOffset: res.nextOffset,
      loading: false,
    })
  },

  async loadMore() {
    const { loading, nextOffset, filter, items } = get()
    if (loading || nextOffset === null) return
    set({ loading: true })
    try {
      const res = await apiGet<TimelineResponse>(
        `/api/gallery/timeline?filter=${filter}&offset=${nextOffset}`
      )
      // Offset paging can re-serve an item if something was added mid-scroll;
      // drop the repeats rather than rendering two tiles with the same key.
      const seen = new Set(items.map((i) => i.id))
      set({
        items: [...items, ...res.items.filter((i) => !seen.has(i.id))],
        nextOffset: res.nextOffset,
      })
    } finally {
      set({ loading: false })
    }
  },

  async refreshQuota() {
    set({ quota: await apiGet<Quota>("/api/me/quota") })
  },

  toggleSelect(id) {
    const selected = new Set(get().selected)
    if (!selected.delete(id)) selected.add(id)
    set({ selected })
  },
  selectMany(ids) {
    const selected = new Set(get().selected)
    for (const id of ids) selected.add(id)
    set({ selected })
  },
  clearSelection: () => set({ selected: new Set() }),

  async setStarred(ids, isStarred) {
    await apiJson("/api/gallery/items", "PATCH", { ids, isStarred })
    const affected = new Set(ids)
    set(({ items, filter }) => ({
      // In the favourites view an unstarred photo no longer belongs; anywhere
      // else it just changes its badge.
      items:
        filter === "favorites" && !isStarred
          ? items.filter((i) => !affected.has(i.id))
          : items.map((i) => (affected.has(i.id) ? { ...i, isStarred } : i)),
      selected: new Set(),
    }))
  },

  async setTrashed(ids, isTrashed) {
    await apiJson("/api/gallery/items", "PATCH", { ids, isTrashed })
    // Trashing in the library and restoring from the bin both remove the item
    // from the list currently on screen.
    const affected = new Set(ids)
    set(({ items }) => ({
      items: items.filter((i) => !affected.has(i.id)),
      selected: new Set(),
    }))
    void get().refreshQuota()
  },

  async loadAlbums() {
    const { albums } = await apiGet<{ albums: Album[] }>("/api/gallery/albums")
    set({ albums })
  },

  async createAlbum(name, fileIds) {
    const { album } = await apiJson<{ album: Album }>("/api/gallery/albums", "POST", {
      name,
      fileIds,
    })
    await get().loadAlbums()
    set({ selected: new Set() })
    return album ?? null
  },

  async renameAlbum(id, name) {
    await apiJson(`/api/gallery/albums/${id}`, "PATCH", { name })
    await get().loadAlbums()
  },

  async deleteAlbum(id) {
    await apiJson(`/api/gallery/albums/${id}`, "DELETE")
    set(({ albums }) => ({ albums: albums.filter((a) => a.id !== id) }))
  },

  async addToAlbum(albumId, fileIds) {
    await apiJson(`/api/gallery/albums/${albumId}/items`, "POST", { fileIds })
    set({ selected: new Set() })
  },

  async removeFromAlbum(albumId, fileIds) {
    await apiJson(`/api/gallery/albums/${albumId}/items`, "DELETE", { fileIds })
    set({ selected: new Set() })
  },

  async upload(files) {
    if (!files.length) return
    // The photos root is handed back by the timeline; ask for it if the user
    // dropped files before anything had loaded.
    let folderId = get().photosRootId
    if (!folderId) {
      const res = await apiGet<TimelineResponse>("/api/gallery/timeline?limit=1")
      folderId = res.photosRootId
      set({ photosRootId: folderId })
    }

    const queued: Upload[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      size: f.size,
      sent: 0,
    }))
    set(({ uploads }) => ({ uploads: [...uploads, ...queued] }))

    const patch = (id: string, next: Partial<Upload>) =>
      set(({ uploads }) => ({
        uploads: uploads.map((u) => (u.id === id ? { ...u, ...next } : u)),
      }))

    let cursor = 0
    const worker = async () => {
      while (cursor < files.length) {
        const i = cursor++
        const entry = queued[i]
        try {
          await uploadFile(files[i], folderId!, (sent) => patch(entry.id, { sent }))
          patch(entry.id, { sent: files[i].size })
        } catch (e) {
          patch(entry.id, { error: (e as Error).message })
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker)
    )

    // Clear the finished rows, keep failures on screen so they can be seen.
    const failed = new Set(get().uploads.filter((u) => u.error).map((u) => u.id))
    set(({ uploads }) => ({ uploads: uploads.filter((u) => failed.has(u.id)) }))

    await get().loadTimeline(get().filter)
    void get().refreshQuota()
  },
}))
