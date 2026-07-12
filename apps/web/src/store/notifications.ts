import { create } from "zustand"
import { apiGet, apiJson } from "@/lib/api"
import type { AppNotification } from "@/lib/types"

type NotificationsState = {
  items: AppNotification[]
  unreadCount: number
  loaded: boolean

  load: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  dismiss: (id: string) => Promise<void>
  receive: (n: AppNotification) => void
}

export const useNotifications = create<NotificationsState>((set, get) => ({
  items: [],
  unreadCount: 0,
  loaded: false,

  load: async () => {
    const r = await apiGet<{ notifications: AppNotification[]; unreadCount: number }>(
      "/api/notifications"
    )
    set({ items: r.notifications, unreadCount: r.unreadCount, loaded: true })
  },

  markRead: async (id) => {
    const wasUnread = get().items.find((n) => n.id === id && !n.readAt)
    set({
      items: get().items.map((n) =>
        n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n
      ),
      unreadCount: wasUnread ? Math.max(0, get().unreadCount - 1) : get().unreadCount,
    })
    await apiJson(`/api/notifications/${id}/read`, "POST")
  },

  markAllRead: async () => {
    const now = new Date().toISOString()
    set({
      items: get().items.map((n) => (n.readAt ? n : { ...n, readAt: now })),
      unreadCount: 0,
    })
    await apiJson("/api/notifications/read-all", "POST")
  },

  dismiss: async (id) => {
    const wasUnread = get().items.find((n) => n.id === id && !n.readAt)
    set({
      items: get().items.filter((n) => n.id !== id),
      unreadCount: wasUnread ? Math.max(0, get().unreadCount - 1) : get().unreadCount,
    })
    await apiJson(`/api/notifications/${id}`, "DELETE")
  },

  receive: (n) => {
    set({ items: [n, ...get().items].slice(0, 100), unreadCount: get().unreadCount + 1 })
  },
}))
