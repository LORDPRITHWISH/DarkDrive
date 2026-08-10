import { useEffect, useState } from "react"
import {
  ArrowsOutSimpleIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  DeviceMobileIcon,
  DownloadSimpleIcon,
  EyeIcon,
  FilesIcon,
  FolderIcon,
  GlobeIcon,
  HardDrivesIcon,
  LinkIcon,
  ProhibitIcon,
  ShareNetworkIcon,
  SignInIcon,
  SparkleIcon,
  UserPlusIcon,
  UsersThreeIcon,
  XCircleIcon,
} from "@phosphor-icons/react"
import { Avatar, AvatarImage, AvatarFallback } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Progress } from "@workspace/ui/components/progress"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { PopConfirm } from "@workspace/ui/components/popconfirm"
import { Sheet, SheetContent } from "@workspace/ui/components/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { apiGet } from "@/lib/api"
import { formatBytes, formatDate, relativeTime } from "@/lib/format"
import { iconFor } from "@/lib/fileIcon"
import { TYPE_META, TYPE_ORDER } from "@/lib/fileType"
import { toast } from "@/store/toast"
import { FilePreview } from "@/components/FilePreview"
import { useAdminFilePreview } from "./useAdminFilePreview"
import type {
  AdminFolderTree,
  Breadcrumb,
  FileItem,
  Folder,
  UserDetail as UserDetailData,
} from "@/lib/types"

const MIN_SHEET_WIDTH = 420
const MAX_SHEET_WIDTH_PCT = 0.9
const DEFAULT_SHEET_WIDTH = 860

const PRESETS = [
  { label: "1 GB", bytes: 1 * 1024 ** 3 },
  { label: "5 GB", bytes: 5 * 1024 ** 3 },
  { label: "10 GB", bytes: 10 * 1024 ** 3 },
  { label: "15 GB", bytes: 15 * 1024 ** 3 },
  { label: "20 GB", bytes: 20 * 1024 ** 3 },
  { label: "50 GB", bytes: 50 * 1024 ** 3 },
  { label: "100 GB", bytes: 100 * 1024 ** 3 },
  { label: "500 GB", bytes: 500 * 1024 ** 3 },
]

type UpdateFn = (id: string, patch: Record<string, unknown>) => void | Promise<void>

// Best-effort "Chrome · macOS" label from a raw user-agent string.
function parseUA(ua: string | null): string {
  if (!ua) return "Unknown device"
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser"
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad|iPod|iOS/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : ""
  return os ? `${browser} · ${os}` : browser
}

export function UserDetail({
  userId,
  meId,
  onClose,
  onUpdate,
}: {
  userId: string
  meId?: string
  onClose: () => void
  onUpdate: UpdateFn
}) {
  const [data, setData] = useState<UserDetailData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [width, setWidth] = useState(DEFAULT_SHEET_WIDTH)
  const { preview, loadingId, open, close } = useAdminFilePreview()

  // Sheet is docked to the right edge, so dragging the left-edge handle
  // grows the sheet as the pointer moves further left.
  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const startX = e.clientX
    const startWidth = width
    el.setPointerCapture(e.pointerId)

    function onMove(ev: PointerEvent) {
      const max = window.innerWidth * MAX_SHEET_WIDTH_PCT
      setWidth(
        Math.min(max, Math.max(MIN_SHEET_WIDTH, startWidth + (startX - ev.clientX)))
      )
    }
    function onUp() {
      el.releasePointerCapture(e.pointerId)
      el.removeEventListener("pointermove", onMove)
      el.removeEventListener("pointerup", onUp)
    }
    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerup", onUp)
  }

  async function load() {
    try {
      setData(await apiGet<UserDetailData>(`/api/admin/users/${userId}/detail`))
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load this user.")
    }
  }
  useEffect(() => {
    setData(null)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function act(patch: Record<string, unknown>) {
    setBusy(true)
    try {
      await onUpdate(userId, patch)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't apply the change.")
    } finally {
      setBusy(false)
    }
  }

  const u = data?.user
  const isSelf = !!u && u.id === meId
  const isDisabled = !!u?.disabledAt

  return (
    <>
      <Sheet
        open
        onOpenChange={(o, details) => {
          // Escape closes the drawer, but only when a file preview isn't
          // taking over — FilePreview handles Escape itself in that case.
          if (!o && details.reason === "escape-key" && preview) return
          if (!o) onClose()
        }}
      >
        <SheetContent className="gap-0" style={{ width, maxWidth: "90vw" }}>
          <div
            onPointerDown={startResize}
            className="hover:bg-primary/30 active:bg-primary/40 absolute top-0 left-0 z-10 h-full w-1.5 cursor-col-resize touch-none"
          />
          {/* Header */}
          <div className="flex items-start gap-3 border-b p-4">
            {u ? (
              <Avatar className="h-12 w-12 shrink-0">
                {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
                <AvatarFallback className="text-base">
                  {u.name[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="bg-muted h-12 w-12 shrink-0 animate-pulse rounded-full" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="truncate text-lg font-semibold">
                  {u?.name ?? "Loading…"}
                </DialogTitle>
                {u && (
                  <Badge variant={u.role === "ADMIN" ? "default" : "muted"}>
                    {u.role}
                  </Badge>
                )}
                {isSelf && <Badge variant="muted">you</Badge>}
                {isDisabled && <Badge variant="destructive">Disabled</Badge>}
                {u?.upgradeRequestedAt && (
                  <Badge variant="default">upgrade requested</Badge>
                )}
              </div>
              {u && (
                <div className="text-muted-foreground truncate text-sm">
                  {u.email}
                </div>
              )}
              {u && (
                <div className="text-muted-foreground mt-0.5 text-xs">
                  Member since {formatDate(u.createdAt)}
                  {isDisabled && u.disabledAt
                    ? ` · disabled ${relativeTime(u.disabledAt)}`
                    : ""}
                </div>
              )}
            </div>
          </div>

        {/* Action bar */}
        {u && (
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isSelf || busy}
                    title={isSelf ? "Can't change your own role" : undefined}
                  />
                }
              >
                Role: {u.role}
                <CaretDownIcon size={12} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Role</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={u.role === "USER"}
                  onClick={() => act({ role: "USER" })}
                >
                  USER
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={u.role === "ADMIN"}
                  onClick={() => act({ role: "ADMIN" })}
                >
                  ADMIN
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button size="sm" variant="outline" disabled={busy} />}
              >
                Quota: {formatBytes(u.storageQuotaBytes)}
                <CaretDownIcon size={12} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Set quota</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {PRESETS.map((p) => (
                  <DropdownMenuCheckboxItem
                    key={p.label}
                    checked={u.storageQuotaBytes === p.bytes}
                    onClick={() =>
                      act({ storageQuotaBytes: p.bytes, clearUpgradeRequest: true })
                    }
                  >
                    {p.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {u.upgradeRequestedAt && (
              <PopConfirm
                title="Dismiss upgrade request?"
                description={`Requested ${formatDate(u.upgradeRequestedAt)}${
                  u.upgradeRequestedBytes
                    ? ` — asked for ${formatBytes(u.upgradeRequestedBytes)}.`
                    : "."
                }`}
                confirmLabel="Dismiss"
                onConfirm={() => act({ clearUpgradeRequest: true })}
                trigger={
                  <Button size="sm" variant="ghost" disabled={busy}>
                    <XCircleIcon size={14} /> Dismiss upgrade
                  </Button>
                }
              />
            )}

            <div className="ml-auto">
              {!isSelf &&
                (isDisabled ? (
                  <PopConfirm
                    title="Re-enable this account?"
                    description="The user's sessions will start working again."
                    confirmLabel="Enable"
                    onConfirm={() => act({ disabled: false })}
                    trigger={
                      <Button size="sm" variant="default" disabled={busy}>
                        <CheckCircleIcon size={14} /> Enable
                      </Button>
                    }
                  />
                ) : (
                  <PopConfirm
                    destructive
                    title="Disable this account?"
                    description="Active sessions will stop working and the user can no longer sign in until re-enabled."
                    confirmLabel="Disable"
                    onConfirm={() => act({ disabled: true })}
                    trigger={
                      <Button size="sm" variant="destructive" disabled={busy}>
                        <ProhibitIcon size={14} /> Disable
                      </Button>
                    }
                  />
                ))}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {err ? (
            <div className="text-destructive py-10 text-center text-sm">{err}</div>
          ) : !data ? (
            <div className="text-muted-foreground py-10 text-center text-sm">
              Loading…
            </div>
          ) : (
            <Body data={data} loadingFileId={loadingId} onOpenFile={open} />
          )}
        </div>
        </SheetContent>
      </Sheet>

      <FilePreview file={preview} onClose={close} />
    </>
  )
}

function Body({
  data,
  loadingFileId,
  onOpenFile,
}: {
  data: UserDetailData
  loadingFileId: string | null
  onOpenFile: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <StorageSection data={data} />
      <DriveBrowserSection
        userId={data.user.id}
        userName={data.user.name}
        loadingFileId={loadingFileId}
        onOpenFile={onOpenFile}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FileListSection
          title="Largest files"
          files={data.largestFiles}
          loadingFileId={loadingFileId}
          onOpenFile={onOpenFile}
          empty="No files stored."
        />
        <FileListSection
          title="Recently uploaded"
          files={data.recentFiles}
          loadingFileId={loadingFileId}
          onOpenFile={onOpenFile}
          showDate
          empty="No uploads yet."
        />
      </div>
      <ActivitySection data={data} />
      <TimelineSection data={data} loadingFileId={loadingFileId} onOpenFile={onOpenFile} />
      <LoginSection data={data} />
      <SharingSection data={data} />
    </div>
  )
}

function SectionTitle({
  icon: Icon,
  children,
  right,
}: {
  icon: React.ComponentType<{ size?: number; weight?: "fill" | "bold" }>
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon size={16} weight="fill" />
        {children}
      </div>
      {right}
    </div>
  )
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="bg-card rounded-lg border p-3">
      <div className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
    </div>
  )
}

function StorageSection({ data }: { data: UserDetailData }) {
  const s = data.storage
  const segments = TYPE_ORDER.filter((k) => s.bytesByType[k] > 0)
  return (
    <section>
      <SectionTitle icon={HardDrivesIcon}>Storage</SectionTitle>
      <div className="bg-card rounded-lg border p-4">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">
            {formatBytes(s.usedBytes)}{" "}
            <span className="text-muted-foreground font-normal">
              of {formatBytes(s.quotaBytes)}
            </span>
          </span>
          <span className="text-muted-foreground tabular-nums">
            {s.pct.toFixed(0)}%
          </span>
        </div>
        <Progress
          className="mt-2"
          value={s.pct}
          indicatorClassName={s.pct >= 80 ? "bg-destructive" : undefined}
        />

        {/* Type breakdown */}
        {s.usedBytes > 0 && (
          <>
            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full">
              {segments.map((k) => (
                <div
                  key={k}
                  className={TYPE_META[k].bar}
                  style={{ width: `${(s.bytesByType[k] / s.usedBytes) * 100}%` }}
                  title={`${TYPE_META[k].label}: ${formatBytes(s.bytesByType[k])}`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {segments.map((k) => (
                <div
                  key={k}
                  className="text-muted-foreground flex items-center gap-1.5 text-xs"
                >
                  <span className={`h-2 w-2 rounded-full ${TYPE_META[k].dot}`} />
                  {TYPE_META[k].label}
                  <span className="text-foreground tabular-nums">
                    {s.byType[k]}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Files" value={s.fileCount.toLocaleString()} />
        <Tile label="Folders" value={s.folderCount.toLocaleString()} />
        <Tile
          label="In trash"
          value={s.trashedCount.toLocaleString()}
          sub={formatBytes(s.trashedBytes)}
        />
        <Tile
          label="Recycle bin"
          value={s.recycleBinCount.toLocaleString()}
          sub={formatBytes(s.recycleBinBytes)}
        />
      </div>
    </section>
  )
}

function FileListSection({
  title,
  files,
  loadingFileId,
  onOpenFile,
  showDate,
  empty,
}: {
  title: string
  files: UserDetailData["largestFiles"]
  loadingFileId: string | null
  onOpenFile: (id: string) => void
  showDate?: boolean
  empty: string
}) {
  return (
    <section>
      <SectionTitle icon={FilesIcon}>{title}</SectionTitle>
      <div className="bg-card rounded-lg border p-2">
        {files.length === 0 ? (
          <div className="text-muted-foreground py-6 text-center text-xs">
            {empty}
          </div>
        ) : (
          <ul className="flex flex-col">
            {files.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onOpenFile(f.id)}
                  disabled={loadingFileId === f.id}
                  title={`Open "${f.name}"`}
                  className="hover:bg-accent/40 flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left disabled:opacity-60"
                >
                  <span className="shrink-0">{iconFor(f.mimeType, 18, f.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm" title={f.name}>
                      {f.name}
                    </div>
                    {showDate && (
                      <div className="text-muted-foreground text-xs">
                        {relativeTime(f.createdAt)}
                      </div>
                    )}
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {formatBytes(f.size)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

type FolderContents = {
  folder: Folder
  folders: Folder[]
  files: FileItem[]
  breadcrumbs: Breadcrumb[]
}

// Shared by the inline sidebar browser and the full-size dialog. `open`
// gates fetching so the dialog's instance stays idle (and cheap) until it's
// actually opened — mirrors the always-mounted-but-gated dialog pattern used
// by RecycleBinMoveDialog elsewhere in this panel.
function useDriveBrowser(userId: string, open: boolean = true) {
  const [folderId, setFolderId] = useState<string | null>(null)
  const [contents, setContents] = useState<FolderContents | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function loadRoot() {
    try {
      const tree = await apiGet<AdminFolderTree>(`/api/admin/users/${userId}/folders/tree`)
      setFolderId(tree.rootId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load this drive.")
    }
  }

  async function loadContents(id: string) {
    try {
      const c = await apiGet<FolderContents>(`/api/folders/${id}/contents`)
      setContents(c)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load this folder.")
    }
  }

  useEffect(() => {
    if (!open) return
    setFolderId(null)
    void loadRoot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, open])

  useEffect(() => {
    if (!folderId) return
    setContents(null)
    void loadContents(folderId)
  }, [folderId])

  return { contents, err, setFolderId }
}

function DriveListing({
  contents,
  err,
  onNavigate,
  loadingFileId,
  onOpenFile,
}: {
  contents: FolderContents | null
  err: string | null
  onNavigate: (id: string) => void
  loadingFileId: string | null
  onOpenFile: (id: string) => void
}) {
  return (
    <>
      {contents && (
        <div className="mb-1 flex min-w-0 flex-wrap items-center gap-1 border-b px-1 pb-2 text-sm">
          {contents.breadcrumbs.map((c, i) => {
            const last = i === contents.breadcrumbs.length - 1
            return (
              <span key={c.id} className="flex min-w-0 items-center gap-1">
                {i > 0 && (
                  <CaretRightIcon size={11} className="text-muted-foreground shrink-0" />
                )}
                <button
                  type="button"
                  onClick={() => onNavigate(c.id)}
                  disabled={last}
                  className={
                    last
                      ? "truncate font-medium"
                      : "text-muted-foreground hover:text-foreground truncate hover:underline"
                  }
                >
                  {c.name}
                </button>
              </span>
            )
          })}
        </div>
      )}

      {err ? (
        <div className="text-destructive py-6 text-center text-xs">{err}</div>
      ) : !contents ? (
        <div className="text-muted-foreground py-6 text-center text-xs">Loading…</div>
      ) : contents.folders.length === 0 && contents.files.length === 0 ? (
        <div className="text-muted-foreground py-6 text-center text-xs">
          Empty folder.
        </div>
      ) : (
        <ul className="flex flex-col">
          {contents.folders.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onNavigate(f.id)}
                title={`Open "${f.name}"`}
                className="hover:bg-accent/40 flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left"
              >
                <FolderIcon
                  size={18}
                  weight="fill"
                  style={{ color: f.color || undefined }}
                  className={`shrink-0 ${f.color ? "" : "text-primary"}`}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                <CaretRightIcon size={12} className="text-muted-foreground shrink-0" />
              </button>
            </li>
          ))}
          {contents.files.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onOpenFile(f.id)}
                disabled={loadingFileId === f.id}
                title={`Open "${f.name}"`}
                className="hover:bg-accent/40 flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left disabled:opacity-60"
              >
                <span className="shrink-0">{iconFor(f.mimeType, 18, f.name)}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {formatBytes(f.size)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// Lets an admin navigate the target user's actual folder tree, not just the
// flat largest/recent lists above. Reuses the ordinary GET /folders/:id/contents
// route — admins already get read-only access to any folder there (see api
// lib/access.ts) — starting from the user's root folder. The expand button
// opens the same browsing experience in a bigger dialog for proper surfing.
function DriveBrowserSection({
  userId,
  userName,
  loadingFileId,
  onOpenFile,
}: {
  userId: string
  userName: string
  loadingFileId: string | null
  onOpenFile: (id: string) => void
}) {
  const { contents, err, setFolderId } = useDriveBrowser(userId)
  const [expanded, setExpanded] = useState(false)

  return (
    <section>
      <SectionTitle
        icon={FolderIcon}
        right={
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setExpanded(true)}
            title="Open in a bigger view"
          >
            <ArrowsOutSimpleIcon size={14} />
          </Button>
        }
      >
        Drive
      </SectionTitle>
      <div className="bg-card rounded-lg border p-2">
        <DriveListing
          contents={contents}
          err={err}
          onNavigate={setFolderId}
          loadingFileId={loadingFileId}
          onOpenFile={onOpenFile}
        />
      </div>

      <DriveBrowserDialog
        open={expanded}
        onClose={() => setExpanded(false)}
        userId={userId}
        userName={userName}
        loadingFileId={loadingFileId}
        onOpenFile={onOpenFile}
      />
    </section>
  )
}

function DriveBrowserDialog({
  open,
  onClose,
  userId,
  userName,
  loadingFileId,
  onOpenFile,
}: {
  open: boolean
  onClose: () => void
  userId: string
  userName: string
  loadingFileId: string | null
  onOpenFile: (id: string) => void
}) {
  const { contents, err, setFolderId } = useDriveBrowser(userId, open)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[70vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle>{userName}&rsquo;s drive</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-3">
          <DriveListing
            contents={contents}
            err={err}
            onNavigate={setFolderId}
            loadingFileId={loadingFileId}
            onOpenFile={onOpenFile}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ActivitySection({ data }: { data: UserDetailData }) {
  const a = data.activity
  return (
    <section>
      <SectionTitle icon={EyeIcon}>Activity</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Views · 7d"
          value={a.views7d.toLocaleString()}
          sub={`${a.views30d.toLocaleString()} in 30d`}
        />
        <Tile
          label="Downloads · 7d"
          value={a.downloads7d.toLocaleString()}
          sub={`${a.downloads30d.toLocaleString()} in 30d`}
        />
        <Tile label="Total events" value={a.total.toLocaleString()} />
        <Tile
          label="Last active"
          value={a.lastActiveAt ? relativeTime(a.lastActiveAt) : "—"}
          sub={a.lastActiveAt ? formatDate(a.lastActiveAt) : "No activity"}
        />
      </div>
    </section>
  )
}

// Unified reverse-chronological feed: account creation, upgrade request,
// disable, logins and every file view/download the server surfaced — the
// user's whole recent story in one column.
type TimelineEvent = {
  key: string
  at: string
  icon: React.ComponentType<{ size?: number; weight?: "fill" | "bold" }>
  tint: string
  node: React.ReactNode
  fileId?: string | null
}

function TimelineSection({
  data,
  loadingFileId,
  onOpenFile,
}: {
  data: UserDetailData
  loadingFileId: string | null
  onOpenFile: (id: string) => void
}) {
  const events: TimelineEvent[] = []

  events.push({
    key: "created",
    at: data.user.createdAt,
    icon: UserPlusIcon,
    tint: "bg-emerald-500/10 text-emerald-500",
    node: <span>Account created</span>,
  })
  if (data.user.upgradeRequestedAt)
    events.push({
      key: "upgrade",
      at: data.user.upgradeRequestedAt,
      icon: SparkleIcon,
      tint: "bg-primary/10 text-primary",
      node: (
        <span>
          Requested a storage upgrade
          {data.user.upgradeRequestedBytes
            ? ` to ${formatBytes(data.user.upgradeRequestedBytes)}`
            : ""}
        </span>
      ),
    })
  if (data.user.disabledAt)
    events.push({
      key: "disabled",
      at: data.user.disabledAt,
      icon: ProhibitIcon,
      tint: "bg-destructive/10 text-destructive",
      node: <span>Account disabled</span>,
    })
  for (const l of data.logins.recent)
    events.push({
      key: `login-${l.id}`,
      at: l.createdAt,
      icon: SignInIcon,
      tint: "bg-sky-500/10 text-sky-500",
      node: (
        <span>
          Signed in
          <span className="text-muted-foreground"> · {parseUA(l.userAgent)}</span>
          {l.ip ? <span className="text-muted-foreground"> · {l.ip}</span> : null}
        </span>
      ),
    })
  for (const ev of data.activity.recent)
    events.push({
      key: `access-${ev.id}`,
      at: ev.accessedAt,
      icon: ev.action === "download" ? DownloadSimpleIcon : EyeIcon,
      tint:
        ev.action === "download"
          ? "bg-sky-500/10 text-sky-500"
          : "bg-emerald-500/10 text-emerald-500",
      fileId: ev.fileId,
      node: (
        <span>
          {ev.action === "download" ? "Downloaded" : "Viewed"}{" "}
          <span className="inline-flex items-center gap-1 align-middle">
            {iconFor(ev.mimeType, 13, ev.fileName)}
            <span>{ev.fileName}</span>
          </span>
        </span>
      ),
    })

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return (
    <section>
      <SectionTitle icon={ClockCounterClockwiseIcon}>Lifecycle timeline</SectionTitle>
      <div className="bg-card rounded-lg border p-2">
        <ul className="flex flex-col">
          {events.map((e) => {
            const Icon = e.icon
            const openable = !!e.fileId
            return (
              <li key={e.key}>
                <button
                  type="button"
                  disabled={!openable || loadingFileId === e.fileId}
                  onClick={() => e.fileId && onOpenFile(e.fileId)}
                  className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left ${
                    openable
                      ? "hover:bg-accent/40 disabled:opacity-60"
                      : "cursor-default"
                  }`}
                >
                  <span
                    className={`${e.tint} grid h-6 w-6 shrink-0 place-items-center rounded-full`}
                  >
                    <Icon size={12} weight="fill" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{e.node}</span>
                  <span
                    className="text-muted-foreground shrink-0 text-xs tabular-nums"
                    title={formatDate(e.at)}
                  >
                    {relativeTime(e.at)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

function LoginSection({ data }: { data: UserDetailData }) {
  const l = data.logins
  return (
    <section>
      <SectionTitle icon={SignInIcon} right={
        <span className="text-muted-foreground text-xs">
          {l.total.toLocaleString()} total
        </span>
      }>
        Login history
      </SectionTitle>
      <div className="bg-card overflow-x-auto rounded-lg border">
        {l.recent.length === 0 ? (
          <div className="text-muted-foreground py-6 text-center text-xs">
            No logins recorded.
          </div>
        ) : (
          <Table className="min-w-105">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Device</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {l.recent.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <DeviceMobileIcon
                        size={14}
                        className="text-muted-foreground shrink-0"
                      />
                      {parseUA(row.userAgent)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <GlobeIcon size={13} className="shrink-0" />
                      {row.ip ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground text-right whitespace-nowrap"
                    title={formatDate(row.createdAt)}
                  >
                    {relativeTime(row.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  )
}

function SharingSection({ data }: { data: UserDetailData }) {
  const s = data.sharing
  return (
    <section>
      <SectionTitle icon={ShareNetworkIcon}>Sharing &amp; collaboration</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Share links" value={s.shareLinks.toLocaleString()} />
        <Tile label="Shortcuts" value={s.shortcuts.toLocaleString()} />
        <Tile label="Spaces owned" value={s.spacesOwned.length.toLocaleString()} />
        <Tile label="Memberships" value={s.memberships.length.toLocaleString()} />
      </div>

      {(s.spacesOwned.length > 0 || s.memberships.length > 0) && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {s.spacesOwned.length > 0 && (
            <div className="bg-card rounded-lg border p-3">
              <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
                <FolderIcon size={12} weight="fill" /> Owns
              </div>
              <ul className="flex flex-col gap-1.5">
                {s.spacesOwned.map((sp) => (
                  <li key={sp.id} className="flex items-center gap-2 text-sm">
                    <span className="truncate">{sp.name}</span>
                    {sp.isPublic && (
                      <Badge variant="muted" className="gap-1">
                        <GlobeIcon size={10} /> public
                      </Badge>
                    )}
                    <span className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1 text-xs">
                      <UsersThreeIcon size={12} /> {sp.memberCount}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s.memberships.length > 0 && (
            <div className="bg-card rounded-lg border p-3">
              <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
                <LinkIcon size={12} weight="fill" /> Member of
              </div>
              <ul className="flex flex-col gap-1.5">
                {s.memberships.map((m) => (
                  <li key={m.spaceId} className="flex items-center gap-2 text-sm">
                    <span className="truncate">{m.name}</span>
                    <Badge variant="muted" className="ml-auto shrink-0">
                      {m.role}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
