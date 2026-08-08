import { Link } from "react-router-dom"
import { ArrowsClockwiseIcon, InfoIcon } from "@phosphor-icons/react"
import { NotificationBell } from "@/components/NotificationBell"

export function HeaderActions({ onReload }: { onReload: () => void }) {
  return (
    <>
      <button
        onClick={onReload}
        title="Reload"
        aria-label="Reload"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <ArrowsClockwiseIcon size={16} />
      </button>
      <Link
        to="/landing"
        title="About DarkDrive"
        aria-label="About DarkDrive"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <InfoIcon size={16} />
      </Link>
      <NotificationBell />
    </>
  )
}
