import { create } from "zustand"
import { apiGet, apiJson } from "@/lib/api"
import type { User } from "@/lib/types"

type AuthState = {
  user: User | null
  loading: boolean
  error: string | null
  hasFetched: boolean
  fetchMe: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  error: null,
  hasFetched: false,
  fetchMe: async () => {
    if (get().hasFetched) return
    set({ loading: true, error: null })
    try {
      const u = await apiGet<User>("/api/auth/me")
      set({ user: u, loading: false, hasFetched: true })
    } catch (e: any) {
      set({ user: null, loading: false, hasFetched: true, error: e.status === 401 ? null : e.message })
    }
  },
  logout: async () => {
    await apiJson<{ ok: boolean }>("/api/auth/logout", "POST")
    set({ user: null })
  },
}))
