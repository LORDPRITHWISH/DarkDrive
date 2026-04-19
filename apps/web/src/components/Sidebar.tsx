import { Link, useLocation } from "react-router-dom"
import {
  HouseIcon,
  FolderIcon,
  UsersThreeIcon,
  PlusIcon,
  ClockCounterClockwiseIcon,
  ShieldCheckIcon,
  TrashIcon,
  GearSixIcon,
} from "@phosphor-icons/react"
import type { Space } from "@/lib/types"
import { SpaceManageDialog } from "@/components/SpaceManageDialog"
import { useEffect, useState } from "react"
import { useAuth } from "@/store/auth"
import { useDrive } from "@/store/drive"
import { useMe } from "@/store/me"
import { formatBytes } from "@/lib/format"
import { Button } from "@workspace/ui/components/button"
import { ThemeToggle } from "@/components/ThemeToggle"

export function Sidebar() {
  const user = useAuth((s) => s.user)
  const { spaces, loadSpaces, createSpace } = useDrive()
  const { quota, loadQuota, requestUpgrade } = useMe()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [upgrading, setUpgrading] = useState(false)
  const [manageSpace, setManageSpace] = useState<Space | null>(null)
  const loc = useLocation()

  useEffect(() => {
    void loadSpaces()
    void loadQuota()
  }, [loadSpaces, loadQuota])

  const pct = quota && quota.total > 0 ? Math.min(100, (quota.used / quota.total) * 100) : 0
  const nearLimit = pct >= 80

  const navItem = (to: string, label: string, icon: React.ReactNode) => (
    <Link
      to={to}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
        loc.pathname === to
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )

  return (
    <aside className="bg-card w-64 shrink-0 border-r p-3 flex flex-col gap-4 h-screen">
      <div className="flex items-center gap-2 px-2 py-3">
        <img src="/DarkDrive.png" alt="DarkDrive" className="h-8 w-8 rounded-md" />
        <div className="font-semibold tracking-tight">DarkDrive</div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {navItem("/home", "Home", <HouseIcon size={18} />)}
        {user && navItem(`/drive/${user.rootFolderId}`, "My Drive", <FolderIcon size={18} />)}
        {navItem("/recent", "Recent", <ClockCounterClockwiseIcon size={18} />)}
        {navItem("/bin", "Bin", <TrashIcon size={18} />)}
        {user?.role === "ADMIN" &&
          navItem("/admin", "Admin", <ShieldCheckIcon size={18} />)}
      </nav>

      <div className="mt-2">
        <div className="flex items-center justify-between px-2">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider">
            <UsersThreeIcon size={14} /> Spaces
          </div>
          <button
            className="hover:bg-accent rounded-md p-1"
            onClick={() => setCreating((v) => !v)}
            title="New space"
          >
            <PlusIcon size={14} />
          </button>
        </div>

        {creating && (
          <div className="mt-1 flex gap-1 px-2">
            <input
              className="bg-background border-input ring-offset-background focus-visible:ring-ring flex-1 rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
              placeholder="Space name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && name.trim()) {
                  await createSpace(name.trim())
                  setName("")
                  setCreating(false)
                }
                if (e.key === "Escape") setCreating(false)
              }}
              autoFocus
            />
          </div>
        )}

        <div className="mt-1 flex flex-col">
          {spaces.map((s) => (
            <div
              key={s.id}
              className="hover:bg-accent/60 group/space flex items-center rounded-md"
            >
              <Link
                to={`/drive/${s.rootFolderId}`}
                className="text-muted-foreground hover:text-foreground min-w-0 flex-1 truncate px-3 py-1.5 text-sm"
                title={s.name}
              >
                {s.name}{" "}
                <span className="text-muted-foreground text-xs">({s.members.length})</span>
              </Link>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setManageSpace(s)
                }}
                className="hover:bg-accent text-muted-foreground hover:text-foreground mr-1 rounded p-1 opacity-0 group-hover/space:opacity-100 focus:opacity-100"
                title="Manage members"
                aria-label="Manage members"
              >
                <GearSixIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <SpaceManageDialog space={manageSpace} onClose={() => setManageSpace(null)} />

      {quota && (
        <div className="mt-auto border-t pt-3">
          <div className="text-muted-foreground mb-1 flex items-center justify-between text-xs">
            <span>Storage</span>
            <span>
              {formatBytes(quota.used)} / {formatBytes(quota.total)}
            </span>
          </div>
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full transition-all ${
                nearLimit ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {quota.role === "USER" && (
            <button
              onClick={async () => {
                setUpgrading(true)
                try {
                  await requestUpgrade()
                } finally {
                  setUpgrading(false)
                }
              }}
              disabled={upgrading || !!quota.upgradeRequestedAt}
              className="text-primary mt-2 w-full text-left text-xs hover:underline disabled:opacity-60"
            >
              {quota.upgradeRequestedAt ? "Upgrade pending review" : "Request upgrade"}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 border-t pt-3">
        {user?.avatarUrl && (
          <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{user?.name}</div>
          <div className="text-muted-foreground truncate text-xs">{user?.email}</div>
        </div>
        <ThemeToggle />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => useAuth.getState().logout()}
          title="Logout"
        >
          ⏻
        </Button>
      </div>
    </aside>
  )
}
