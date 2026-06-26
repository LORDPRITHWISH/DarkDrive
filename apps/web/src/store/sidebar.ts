import { create } from "zustand"

type SidebarState = {
  collapsed: boolean
  toggle: () => void
}

export const useSidebar = create<SidebarState>((set) => ({
  collapsed: localStorage.getItem("sidebar-collapsed") === "1",
  toggle: () =>
    set((s) => {
      const next = !s.collapsed
      localStorage.setItem("sidebar-collapsed", next ? "1" : "0")
      return { collapsed: next }
    }),
}))
