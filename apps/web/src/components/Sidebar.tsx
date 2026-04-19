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
  UploadIcon,
} from "@phosphor-icons/react"
import type { Space } from "@/lib/types"
import { SpaceManageDialog } from "@/components/SpaceManageDialog"
import { UpgradeRequestDialog } from "@/components/UpgradeRequestDialog"
import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/store/auth"
import { useDrive } from "@/store/drive"
import { useMe } from "@/store/me"
import { formatBytes } from "@/lib/format"
import { Button } from "@workspace/ui/components/button"
import { ThemeToggle } from "@/components/ThemeToggle"

export function Sidebar() {
  const user = useAuth((s) => s.user)
  const { spaces, loadSpaces, createSpace, upload, currentFolderId } =
    useDrive()
  const { quota, loadQuota, requestUpgrade } = useMe()
  const fileInput = useRef<HTMLInputElement>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [manageSpace, setManageSpace] = useState<Space | null>(null)
  const loc = useLocation()

  useEffect(() => {
    void loadSpaces()
    void loadQuota()
  }, [loadSpaces, loadQuota])

  const pct =
    quota && quota.total > 0
      ? Math.min(100, (quota.used / quota.total) * 100)
      : 0
  const nearLimit = pct >= 80

  const navItem = (to: string, label: string, icon: React.ReactNode) => (
    <Link
      to={to}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
        loc.pathname === to
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col gap-4 border-r bg-card p-3">
      <div className="flex items-center gap-2 px-1 py-3">
        <img
          src="/DarkDrive.png"
          alt="DarkDrive"
          className="h-8 w-8 rounded-md"
        />
        <div className="font-semibold tracking-tight">DarkDrive</div>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => fileInput.current?.click()}
          title="Upload files"
        >
          <UploadIcon size={16} weight="bold" />
          Upload
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const target = currentFolderId ?? user?.rootFolderId
            if (e.target.files && target) void upload(e.target.files, target)
            e.target.value = ""
          }}
        />
      </div>

      <nav className="flex flex-col gap-0.5">
        {navItem("/home", "Home", <HouseIcon size={18} />)}
        {user &&
          navItem(
            `/drive/${user.rootFolderId}`,
            "My Drive",
            <FolderIcon size={18} />
          )}
        {navItem("/recent", "Recent", <ClockCounterClockwiseIcon size={18} />)}
        {navItem("/bin", "Bin", <TrashIcon size={18} />)}
        {user?.role === "ADMIN" &&
          navItem("/admin", "Admin", <ShieldCheckIcon size={18} />)}
      </nav>

      <div className="mt-2">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            <UsersThreeIcon size={14} /> Spaces
          </div>
          <button
            className="rounded-md p-1 hover:bg-accent"
            onClick={() => setCreating((v) => !v)}
            title="New space"
          >
            <PlusIcon size={14} />
          </button>
        </div>

        {creating && (
          <div className="mt-1 flex gap-1 px-2">
            <input
              className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
              className="group/space flex items-center rounded-md hover:bg-accent/60"
            >
              <Link
                to={`/drive/${s.rootFolderId}`}
                className="min-w-0 flex-1 truncate px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                title={s.name}
              >
                {s.name}{" "}
                <span className="text-xs text-muted-foreground">
                  ({s.members.length})
                </span>
              </Link>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setManageSpace(s)
                }}
                className="mr-1 rounded p-1 text-muted-foreground opacity-0 group-hover/space:opacity-100 hover:bg-accent hover:text-foreground focus:opacity-100"
                title="Manage members"
                aria-label="Manage members"
              >
                <GearSixIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <SpaceManageDialog
        space={manageSpace}
        onClose={() => setManageSpace(null)}
      />

      {quota && (
        <div className="mt-auto border-t pt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Storage</span>
            <span>
              {formatBytes(quota.used)} / {formatBytes(quota.total)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                nearLimit ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {quota.role === "USER" && (
            <button
              onClick={() => setUpgradeOpen(true)}
              disabled={!!quota.upgradeRequestedAt}
              className="mt-2 w-full text-left text-xs text-primary hover:underline disabled:opacity-60"
            >
              {quota.upgradeRequestedAt
                ? `Pending review — requested ${
                    quota.upgradeRequestedBytes
                      ? formatBytes(quota.upgradeRequestedBytes)
                      : "an upgrade"
                  }`
                : "Request upgrade"}
            </button>
          )}
        </div>
      )}

      {quota && (
        <UpgradeRequestDialog
          open={upgradeOpen}
          currentQuotaBytes={quota.total}
          usedBytes={quota.used}
          onClose={() => setUpgradeOpen(false)}
          onSubmit={(bytes) => requestUpgrade(bytes)}
        />
      )}

      <div className="flex items-center gap-2 border-t pt-3">
        {user?.avatarUrl && (
          <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{user?.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {user?.email}
          </div>
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
