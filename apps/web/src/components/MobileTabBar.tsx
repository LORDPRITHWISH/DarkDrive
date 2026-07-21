import { Link, useLocation } from "react-router-dom"
import {
  HouseIcon,
  MagnifyingGlassIcon,
  UsersThreeIcon,
  ClockCounterClockwiseIcon,
  ListIcon,
} from "@phosphor-icons/react"
import { useSidebar } from "@/store/sidebar"

const TABS = [
  { to: "/home", label: "Home", Icon: HouseIcon },
  { to: "/search", label: "Search", Icon: MagnifyingGlassIcon },
  { to: "/spaces", label: "Spaces", Icon: UsersThreeIcon },
  { to: "/recent", label: "Recent", Icon: ClockCounterClockwiseIcon },
]

/**
 * Primary mobile navigation. The drawer still exists for the long tail
 * (starred, bin, admin, spaces list, quota) — this is just the four
 * destinations worth a permanent thumb-reachable slot.
 */
export function MobileTabBar() {
  const loc = useLocation()
  const setMobileOpen = useSidebar((s) => s.setMobileOpen)

  return (
    <nav className="bg-card/95 fixed inset-x-0 bottom-0 z-30 flex border-t backdrop-blur-lg md:hidden pb-safe">
      {TABS.map(({ to, label, Icon }) => {
        const active = loc.pathname === to || loc.pathname.startsWith(to + "/")
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 text-[0.625rem] transition-colors active:bg-accent ${
              active ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Icon size={22} weight={active ? "fill" : "regular"} />
            <span>{label}</span>
          </Link>
        )
      })}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="More"
        className="text-muted-foreground active:bg-accent flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 text-[0.625rem] transition-colors"
      >
        <ListIcon size={22} />
        <span>More</span>
      </button>
    </nav>
  )
}
