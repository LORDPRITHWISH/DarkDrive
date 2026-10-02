import { create } from "zustand"

type SidebarState = {
  collapsed: boolean
  mobileOpen: boolean
  /** Whether the nav's "More" group is showing. */
  moreOpen: boolean
  toggle: () => void
  toggleMore: () => void
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
  moreOpen: localStorage.getItem("sidebar-more") === "1",
  toggleMore: () =>
    set((s) => {
      localStorage.setItem("sidebar-more", s.moreOpen ? "0" : "1")
      return { moreOpen: !s.moreOpen }
    }),
  setMobileOpen: (open) => set({ mobileOpen: open }),
}))
