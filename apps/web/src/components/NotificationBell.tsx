import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  BellIcon,
  UsersThreeIcon,
  CheckCircleIcon,
  XCircleIcon,
  GaugeIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react"
import { useNotifications } from "@/store/notifications"
import { relativeTime } from "@/lib/format"
import type { AppNotification, NotificationType } from "@/lib/types"

function iconFor(type: NotificationType) {
  const size = 16
  switch (type) {
    case "space_invite":
    case "space_role_changed":
    case "space_removed":
      return <UsersThreeIcon size={size} weight="fill" className="text-sky-500" />
    case "quota_upgrade_approved":
      return <CheckCircleIcon size={size} weight="fill" className="text-emerald-500" />
    case "quota_upgrade_denied":
      return <XCircleIcon size={size} weight="fill" className="text-muted-foreground" />
    case "quota_near_limit":
      return <WarningCircleIcon size={size} weight="fill" className="text-destructive" />
    default:
      return <GaugeIcon size={size} weight="fill" className="text-amber-500" />
  }
}

export function NotificationBell() {
  const nav = useNavigate()
  const { items, unreadCount, loaded, load, markRead, markAllRead, dismiss } =
    useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])

  const onClickItem = (n: AppNotification) => {
    if (!n.readAt) void markRead(n.id)
    setOpen(false)
    if (n.link) nav(n.link)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        className="relative rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <BellIcon size={16} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-semibold leading-none text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="bg-popover animate-in fade-in slide-in-from-top-1 absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-xl duration-150">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="text-muted-foreground px-3 py-8 text-center text-sm">
                No notifications yet.
              </div>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={`group/notif flex items-start gap-2.5 border-b px-3 py-2.5 last:border-b-0 hover:bg-accent/60 ${
                    n.readAt ? "" : "bg-accent/30"
                  } ${n.link ? "cursor-pointer" : ""}`}
                  onClick={() => onClickItem(n)}
                >
                  <div className="mt-0.5 shrink-0">{iconFor(n.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-sm leading-snug ${n.readAt ? "text-foreground/90" : "font-medium"}`}
                    >
                      {n.title}
                    </div>
                    {n.body && (
                      <div className="text-muted-foreground mt-0.5 text-xs leading-snug">
                        {n.body}
                      </div>
                    )}
                    <div className="text-muted-foreground mt-1 text-[11px]">
                      {relativeTime(n.createdAt)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void dismiss(n.id)
                    }}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover/notif:opacity-100"
                    title="Dismiss"
                    aria-label="Dismiss"
                  >
                    <XIcon size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
