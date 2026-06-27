import { create } from "zustand"

type SidebarState = {
  collapsed: boolean
  mobileOpen: boolean
  toggle: () => void
  setMobileOpen: (open: boolean) => void
}

export const useSidebar = create<SidebarState>((set) => ({
  collapsed: localStorage.getItem("sidebar-collapsed") === "1",
  mobileOpen: false,
  toggle: () =>
    set((s) => {
      const next = !s.collapsed
      localStorage.setItem("sidebar-collapsed", next ? "1" : "0")
      return { collapsed: next }
    }),
  setMobileOpen: (open) => set({ mobileOpen: open }),
}))
