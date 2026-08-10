import { Link, useLocation } from "react-router-dom"
import {
  HouseIcon,
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  UsersThreeIcon,
  PlusIcon,
  ClockCounterClockwiseIcon,
  ShieldCheckIcon,
  StarIcon,
  TrashIcon,
  PushPinSlashIcon,
  UploadIcon,
  UploadSimpleIcon,
  GlobeIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react"
import { SpaceEditorDialog } from "@/components/SpaceEditorDialog"
import { SpaceLogo } from "@/components/SpaceLogo"
import { UpgradeRequestDialog } from "@/components/UpgradeRequestDialog"
import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/store/auth"
import { useDrive } from "@/store/drive"
import { useMe } from "@/store/me"
import { useSidebar } from "@/store/sidebar"
import { formatBytes } from "@/lib/format"
import { TYPE_META, TYPE_ORDER } from "@/lib/fileType"
import type { QuotaInfo } from "@/lib/types"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { ThemeToggle } from "@/components/ThemeToggle"
import { MobileTabBar } from "@/components/MobileTabBar"

export function Sidebar() {
  const user = useAuth((s) => s.user)
  const { spaces, loadSpaces, togglePinSpace, upload, currentFolderId } = useDrive()
  const { quota, loadQuota, requestUpgrade } = useMe()
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const [creatingSpace, setCreatingSpace] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const desktopCollapsed = useSidebar((s) => s.collapsed)
  const mobileOpen = useSidebar((s) => s.mobileOpen)
  const setMobileOpen = useSidebar((s) => s.setMobileOpen)
  const loc = useLocation()

  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 767px)").matches
  )
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)")
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [loc.pathname, setMobileOpen])

  const collapsed = isMobile ? false : desktopCollapsed

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
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors [&_svg]:shrink-0 md:gap-2 md:rounded-md md:py-2 ${
        collapsed ? "justify-center px-2" : ""
      } ${
        loc.pathname === to
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      }`}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </Link>
  )

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 md:relative md:z-auto ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 flex h-screen shrink-0 flex-col gap-4 border-r bg-card p-3 transition-transform duration-200 md:transition-all w-[85vw] max-w-xs md:max-w-none ${
          desktopCollapsed ? "md:w-14" : "md:w-64"
        }`}
      >
        {/* Header: logo + upload */}
        <div className={`flex items-center gap-2 px-1 py-3 ${collapsed ? "flex-col" : ""}`}>
          <Link
            to="/home"
            className="hover:text-primary flex shrink-0 items-center gap-2 transition-colors"
            title="Home"
          >
            <img src="/DarkDrive.png" alt="DarkDrive" className="h-8 w-8 shrink-0 rounded-md" />
            {!collapsed && <div className="font-semibold tracking-tight">DarkDrive</div>}
          </Link>

          <div className={`flex items-center gap-1.5 ${collapsed ? "" : "ml-auto"}`}>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  collapsed ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      title="Upload"
                    >
                      <UploadIcon size={16} weight="bold" />
                    </Button>
                  ) : (
                    <Button size="sm" title="Upload">
                      <UploadIcon size={16} weight="bold" />
                      <span className="hidden md:inline">Upload</span>
                    </Button>
                  )
                }
              />
              <DropdownMenuContent className="w-36">
                <DropdownMenuItem onClick={() => fileInput.current?.click()}>
                  <FileIcon size={14} />
                  Files
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => folderInput.current?.click()}>
                  <FolderOpenIcon size={14} />
                  Folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              onClick={() => setMobileOpen(false)}
              className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors md:hidden"
            >
              <XIcon size={20} />
            </button>
          </div>

          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const target = currentFolderId ?? user?.rootFolderId
              if (e.target.files?.length && target) void upload(e.target.files, target)
              e.target.value = ""
            }}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            hidden
            // Non-standard attributes that switch the native picker to
            // folder-selection mode in Chromium/Firefox.
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            onChange={(e) => {
              const target = currentFolderId ?? user?.rootFolderId
              if (e.target.files?.length && target) void upload(e.target.files, target)
              e.target.value = ""
            }}
          />
        </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5">
        {navItem("/home", "Home", <HouseIcon size={18} />)}
        {user &&
          navItem(
            `/drive/${user.rootFolderId}`,
            "My Drive",
            <FolderIcon size={18} />
          )}
        {navItem("/spaces", "Spaces", <UsersThreeIcon size={18} />)}
        {navItem("/search", "Search", <MagnifyingGlassIcon size={18} />)}
        {navItem("/recent", "Recent", <ClockCounterClockwiseIcon size={18} />)}
        {navItem("/uploads", "Uploads", <UploadSimpleIcon size={18} />)}
        {navItem("/starred", "Starred", <StarIcon size={18} />)}
        {navItem("/bin", "Bin", <TrashIcon size={18} />)}
        {user?.role === "ADMIN" &&
          navItem("/admin", "Admin", <ShieldCheckIcon size={18} />)}
      </nav>

      {/* Pinned spaces — the "/spaces" nav item above is the full gateway;
          this is just quick access to the ones pinned from there. */}
      <div className="mt-2">
        <div
          className={`flex items-center px-2 ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!collapsed && (
            <div className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Pinned
            </div>
          )}
          <button
            className="rounded-md p-1 hover:bg-accent text-muted-foreground hover:text-foreground"
            onClick={() => setCreatingSpace(true)}
            title="New space"
          >
            <PlusIcon size={14} />
          </button>
        </div>

        <div className="mt-1 flex flex-col">
          {spaces
            .filter((s) => s.pinned)
            .map((s) =>
            collapsed ? (
              <Link
                key={s.id}
                to={`/drive/${s.rootFolderId}`}
                title={s.name}
                className="flex justify-center rounded-md py-1.5 hover:bg-accent/60"
              >
                <SpaceLogo space={s} size={20} />
              </Link>
            ) : (
              <div
                key={s.id}
                className="group/space flex items-center rounded-md hover:bg-accent/60"
              >
                <Link
                  to={`/drive/${s.rootFolderId}`}
                  className="flex min-w-0 flex-1 items-center gap-2 truncate px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                  title={s.name}
                >
                  <SpaceLogo space={s} size={20} className="shrink-0" />
                  <span className="truncate">{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({s.members.length})
                  </span>
                  {s.isPublic && (
                    <GlobeIcon
                      size={12}
                      weight="fill"
                      className="text-primary ml-auto shrink-0"
                      aria-label="Public space"
                    />
                  )}
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void togglePinSpace(s.id, false)
                  }}
                  className="mr-1 rounded p-1 text-muted-foreground opacity-0 group-hover/space:opacity-100 hover:bg-accent hover:text-foreground focus:opacity-100"
                  title="Unpin from sidebar"
                  aria-label="Unpin from sidebar"
                >
                  <PushPinSlashIcon size={14} />
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Storage quota */}
      {quota && !collapsed && (
        <div className="mt-auto border-t pt-3">
          <Popover>
            <PopoverTrigger className="block w-full text-left" title="Storage breakdown">
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
            </PopoverTrigger>
            <PopoverContent align="start">
              <StorageBreakdown quota={quota} />
            </PopoverContent>
          </Popover>
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

      {/* Collapsed storage indicator: just the bar */}
      {quota && collapsed && (
        <div className="mt-auto border-t pt-3">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            title={`${formatBytes(quota.used)} / ${formatBytes(quota.total)}`}
          >
            <div
              className={`h-full rounded-full ${nearLimit ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* User row */}
      <div
        className={`flex items-center gap-2 border-t pt-3 ${
          collapsed ? "flex-col" : ""
        }`}
      >
        {user?.avatarUrl && (
          <img
            src={user.avatarUrl}
            alt={user.name}
            title={collapsed ? `${user.name}\n${user.email}` : undefined}
            className="h-8 w-8 rounded-full shrink-0"
          />
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user?.name}</div>
            <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
          </div>
        )}
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

      <MobileTabBar />

      {/* Rendered outside <aside> — it has a transform (translate-x-*) for
          the mobile slide-in, which would otherwise scope these dialogs'
          `fixed inset-0` to the sidebar's box instead of the viewport. */}
      <SpaceEditorDialog
        mode={creatingSpace ? { kind: "create" } : null}
        onClose={() => setCreatingSpace(false)}
      />
      {quota && (
        <UpgradeRequestDialog
          open={upgradeOpen}
          currentQuotaBytes={quota.total}
          usedBytes={quota.used}
          onClose={() => setUpgradeOpen(false)}
          onSubmit={(bytes) => requestUpgrade(bytes)}
        />
      )}
    </>
  )
}

function StorageBreakdown({ quota }: { quota: QuotaInfo }) {
  const segments = TYPE_ORDER.filter((k) => quota.bytesByType[k] > 0)
  if (segments.length === 0)
    return <div className="text-muted-foreground text-xs">No files yet.</div>
  return (
    <div>
      <div className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
        Storage breakdown
      </div>
      <div className="flex h-2 overflow-hidden rounded-full">
        {segments.map((k) => (
          <div
            key={k}
            className={TYPE_META[k].bar}
            style={{ width: `${(quota.bytesByType[k] / quota.used) * 100}%` }}
            title={`${TYPE_META[k].label}: ${formatBytes(quota.bytesByType[k])}`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {segments.map((k) => (
          <li key={k} className="flex items-center gap-1.5 text-xs">
            <span className={`h-2 w-2 shrink-0 rounded-full ${TYPE_META[k].dot}`} />
            <span className="text-muted-foreground flex-1">{TYPE_META[k].label}</span>
            <span className="tabular-nums">{quota.byType[k]}</span>
            <span className="text-muted-foreground w-16 text-right tabular-nums">
              {formatBytes(quota.bytesByType[k])}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
