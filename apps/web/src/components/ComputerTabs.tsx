import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { desktop, type DesktopState } from "@/lib/desktop"

// "This computer" is one sidebar entry and two pages: its files (pages/Local)
// and what it syncs (pages/Sync). This is the switch between them, at the
// start of both headers. The dot on Sync says how sync is doing while the
// files are what's being looked at.
export function ComputerTabs() {
  const { pathname } = useLocation()
  const [state, setState] = useState<DesktopState | null>(null)
  useEffect(() => {
    if (!desktop) return
    const load = () => void desktop!.getState().then(setState)
    load()
    return desktop.onChange(load)
  }, [])

  const tab = (to: string, label: string, extra?: React.ReactNode) => (
    <Link
      to={to}
      aria-current={pathname === to ? "page" : undefined}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
        pathname === to ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {extra}
    </Link>
  )
  return (
    <nav aria-label="This computer" className="bg-muted flex shrink-0 items-center gap-0.5 rounded-lg p-0.5">
      {tab("/local", "Files")}
      {tab(
        "/sync",
        "Sync",
        !!state?.folders.length && (
          <span
            title={state.status}
            className={`size-1.5 rounded-full ${state.syncing ? "bg-primary" : "bg-muted-foreground"}`}
          />
        )
      )}
    </nav>
  )
}
