import { useEffect, useMemo, useRef, useState } from "react"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Button } from "@workspace/ui/components/button"
import { Link, useNavigate } from "react-router-dom"
import {
  ArrowsClockwiseIcon,
  ChecksIcon,
  DiceFiveIcon,
  FileArrowUpIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  LinkSimpleIcon,
  StarIcon,
  UploadSimpleIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react"
import { useAuth } from "@/store/auth"
import { useDrive } from "@/store/drive"
import { useMe } from "@/store/me"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
import { FilePreview } from "@/components/FilePreview"
import { FileThumb } from "@/components/file-grid/FileThumb"
import { NewFolderDialog } from "@/components/NewFolderDialog"
import { ImportUrlDialog } from "@/components/ImportUrlDialog"
import { SpaceEditorDialog } from "@/components/SpaceEditorDialog"
import { apiGet } from "@/lib/api"
import { driveFacts } from "@/lib/driveFacts"
import { entriesFromDataTransfer, type UploadEntry } from "@/lib/dropEntries"
import { TYPE_META, TYPE_ORDER } from "@/lib/fileType"
import { formatBytes, formatDate, relativeTime } from "@/lib/format"
import { iconFor } from "@/lib/fileIcon"
import type { FileItem, QuotaInfo } from "@/lib/types"
import { useItemMenu } from "@/components/ItemMenu"
import { useGridKeyNav } from "@/lib/useGridKeyNav"

const BACKDROP = "/assets/Moonlit%20Gothic%20Castle%20and%20Waterfall.png"
const SEEN_KEY = "dd.home.newSeenAt"
// The API's ceiling for /recently-added. A full page means there may be more.
const NEW_LIMIT = 50
// Folder and new-file chips are at least this wide; with the gap between them
// that decides how many fit on the single line each of those rows gets.
const CHIP_MIN = 200
const CHIP_GAP = 12

const sectionLabel = "text-muted-foreground text-xs font-medium tracking-wider uppercase"
// Hover is colour, border and glow only: nothing here changes an element's
// size, so hovering one card never nudges its neighbours.
const card =
  "group/card bg-card hover:border-primary hover:bg-primary/5 focus-visible:border-primary rounded-lg border text-left outline-none transition-[background-color,border-color,box-shadow] duration-200 hover:shadow-[0_8px_24px_-14px_color-mix(in_oklab,var(--primary)_45%,transparent)] focus-visible:ring-2 focus-visible:ring-primary"
const nudge = "transition-transform duration-200"

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return "Up late"
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

export function HomePage() {
  const user = useAuth((s) => s.user)
  const {
    quota,
    suggestions,
    folderSuggestions,
    recent,
    recentlyAdded,
    loadQuota,
    loadSuggestions,
    loadFolderSuggestions,
    loadRecent,
    loadRecentlyAdded,
    dismissRecentlyAdded,
    pushNav,
  } = useMe()
  const { upload, importUrl, createFolder } = useDrive()
  const [preview, setPreview] = useState<FileItem | null>(null)
  const [lucky, setLucky] = useState<FileItem | null>(null)
  const [factIndex, setFactIndex] = useState(0)
  const [dialog, setDialog] = useState<"folder" | "url" | "space" | null>(null)
  const [dropping, setDropping] = useState(false)
  const [showAllNew, setShowAllNew] = useState(false)
  const [seenAt, setSeenAt] = useState(() => Number(localStorage.getItem(SEEN_KEY)) || 0)
  const [cols, setCols] = useState(4)
  const dragDepth = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const root = user?.rootFolderId

  // Open a folder from Home by first priming the drive history with My Drive
  // root so pressing Back inside the folder returns to the drive, not Home.
  async function openFolder(folderId: string) {
    if (root && root !== folderId) {
      await pushNav(`/drive/${root}`)
    }
    navigate(`/drive/${folderId}`)
  }

  // Best effort: the card just stays away if there's nothing old enough.
  function shuffle() {
    void apiGet<{ file: FileItem | null }>("/api/me/rediscover")
      .then((r) => setLucky(r.file))
      .catch(() => {})
  }

  // `withQuota` is off only for the first load: the sidebar fetches the quota
  // on mount, and that endpoint walks every file the user owns.
  function reload(withQuota = true) {
    void loadSuggestions(6)
    void loadFolderSuggestions(8)
    void loadRecent(6)
    void loadRecentlyAdded(NEW_LIMIT)
    shuffle()
    if (withQuota) void loadQuota()
  }

  // Home has no "current folder", so everything started from here is aimed at
  // My Drive's root explicitly.
  function uploadToDrive(files: FileList | UploadEntry[]) {
    if (!root || !files.length) return
    void upload(files, root).then(() => reload())
  }

  const { openMenu, itemMenu } = useItemMenu({ onPreview: setPreview, onChanged: () => reload() })
  const contentRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  useGridKeyNav(contentRef)

  useEffect(() => {
    reload(false)
  }, [])

  // How many chips fit on one line. Rendering only that many (rather than
  // clipping the overflow) keeps hidden chips out of the tab order.
  useEffect(() => {
    const el = columnRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) =>
      setCols(
        Math.max(2, Math.floor((entry.contentRect.width + CHIP_GAP) / (CHIP_MIN + CHIP_GAP)))
      )
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function openFile(f: FileItem) {
    // Optimistically remove from the "new" row — opening hits
    // /download?inline=1 which writes a FileAccess row, so subsequent
    // loads will also exclude it.
    dismissRecentlyAdded(f.id)
    setPreview(f)
  }

  // ponytail: "Mark all as seen" lives in this browser's localStorage, so it
  // doesn't follow the user to another device. Move it server-side if it
  // should; FileAccess is the wrong home, a row there reads as an open.
  const fresh = useMemo(
    () => recentlyAdded.filter((f) => new Date(f.createdAt).getTime() > seenAt),
    [recentlyAdded, seenAt]
  )
  function markAllSeen() {
    // The newest file on screen, not Date.now(): no dependence on this
    // machine's clock agreeing with the server's.
    const newest = Math.max(...fresh.map((f) => new Date(f.createdAt).getTime()))
    localStorage.setItem(SEEN_KEY, String(newest))
    setSeenAt(newest)
  }
  const newCount = `${fresh.length}${recentlyAdded.length === NEW_LIMIT ? "+" : ""}`

  const facts = useMemo(() => (quota ? driveFacts(quota) : []), [quota])

  const allFiles = useMemo(() => {
    const seen = new Set<string>()
    const result: FileItem[] = []
    for (const f of [...fresh, ...suggestions, ...recent, ...(lucky ? [lucky] : [])]) {
      if (!seen.has(f.id)) { seen.add(f.id); result.push(f) }
    }
    return result
  }, [fresh, suggestions, recent, lucky])

  const firstName = user?.name?.split(" ")[0] ?? ""
  const oneLine = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }

  return (
    <div
      className="flex h-screen"
      onDragEnter={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return
        dragDepth.current++
        setDropping(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDropping(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        dragDepth.current = 0
        setDropping(false)
        // Walk dropped entries so folders (and their subfolders) keep their
        // structure instead of collapsing into a flat file list.
        void entriesFromDataTransfer(e.dataTransfer).then(uploadToDrive)
      }}
    >
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <SidebarToggle />
          <div className="text-sm font-semibold">Home</div>
          <div className="ml-auto flex items-center gap-1">
            <HeaderActions onReload={() => reload()} />
          </div>
        </header>
        <ScrollArea ref={contentRef} className="min-h-0 flex-1">
          <div className="px-4 py-5 md:px-10 md:py-8">
            <div ref={columnRef} className="flex flex-col gap-10">
              <div className="flex flex-col gap-7">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
                  <div className="min-w-0 flex-[1_1_280px]">
                    <h1 className="text-3xl font-semibold tracking-tight">
                      {greeting()}
                      {firstName && `, ${firstName}`}
                    </h1>
                    <p className="text-muted-foreground mt-1.5 text-[15px]">
                      {fresh.length > 0
                        ? `${newCount} new ${fresh.length === 1 ? "file" : "files"} you haven't opened yet.`
                        : "Nothing new since you last looked."}
                    </p>
                  </div>

                  {facts.length > 0 && (
                    <div className="bg-card ml-auto flex max-w-130 min-w-0 flex-[1_1_360px] items-center gap-3.5 rounded-xl border px-3.5 py-3">
                      <img src="/DarkDrive.png" alt="" className="size-12 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className={sectionLabel}>Drive trivia</div>
                        <div className="mt-0.5 text-sm text-pretty">
                          {facts[factIndex % facts.length]}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label="Another fact"
                        title="Another fact"
                        onClick={() => setFactIndex((i) => i + 1)}
                      >
                        <ArrowsClockwiseIcon className="transition-transform duration-500 motion-safe:group-hover/button:rotate-180" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-4">
                  <div
                    className={`group/drop hover:border-primary-bright relative flex min-w-0 flex-[1.3_1_300px] flex-col items-center justify-center gap-3.5 overflow-hidden rounded-xl border-2 border-dashed px-5 py-7 text-center text-white transition-[border-color,box-shadow] duration-300 hover:shadow-[0_0_28px_-12px_color-mix(in_oklab,var(--primary)_45%,transparent)] ${
                      dropping ? "border-primary-bright" : "border-primary/40"
                    }`}
                  >
                    <img
                      src={BACKDROP}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    {/* The picture sets the mood; the scrim keeps the text readable
                        over it and the tint pulls it toward the brand colour. */}
                    <div
                      className={`absolute inset-0 transition-colors ${
                        dropping ? "bg-black/55" : "bg-black/75"
                      }`}
                    />
                    <div className="bg-primary/10 group-hover/drop:bg-primary/25 absolute inset-0 transition-colors duration-300" />
                    <span className="bg-primary text-primary-foreground group-hover/drop:bg-primary-bright relative grid size-12 place-items-center rounded-full transition-colors duration-300">
                      <UploadSimpleIcon
                        size={22}
                        weight="bold"
                        className={`${nudge} motion-safe:group-hover/drop:-translate-y-0.5`}
                      />
                    </span>
                    <div className="relative">
                      <div className="text-base font-semibold">
                        {dropping ? "Drop to upload" : "Drop files here to upload"}
                      </div>
                      <div className="mt-0.5 text-[13px] text-white/80">
                        They land in My Drive. Whole folders work too.
                      </div>
                    </div>
                    <div className="relative flex flex-wrap justify-center gap-2">
                      <Button size="lg" onClick={() => fileInput.current?.click()}>
                        <FileArrowUpIcon />
                        Upload files
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="border-primary/60 bg-primary/15 hover:border-primary hover:bg-primary hover:text-primary-foreground text-white"
                        onClick={() => folderInput.current?.click()}
                      >
                        <FolderOpenIcon />
                        Upload folder
                      </Button>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-4">
                    {[
                      {
                        icon: <FolderPlusIcon size={18} />,
                        title: "New folder",
                        hint: "Create one in My Drive",
                        onClick: () => setDialog("folder"),
                      },
                      {
                        icon: <LinkSimpleIcon size={18} />,
                        title: "Import from URL",
                        hint: "Save a link straight to your drive",
                        onClick: () => setDialog("url"),
                      },
                      {
                        icon: <UsersThreeIcon size={18} />,
                        title: "New space",
                        hint: "Share a folder with other people",
                        onClick: () => setDialog("space"),
                      },
                    ].map((a) => (
                      <button
                        key={a.title}
                        onClick={a.onClick}
                        className={`${card} flex flex-1 items-center gap-3.5 px-4 py-3.5`}
                      >
                        <span className="bg-muted group-hover/card:bg-primary group-hover/card:text-primary-foreground grid size-10 shrink-0 place-items-center rounded-lg transition-colors duration-200">
                          {a.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{a.title}</span>
                          <span className="text-muted-foreground block text-xs">{a.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>

                  {quota && <DriveStats quota={quota} />}
                </div>
              </div>

              {folderSuggestions.length > 0 && (
                <section>
                  <div className="mb-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <h2 className={sectionLabel}>Folders</h2>
                    <span className="text-muted-foreground text-xs">
                      starred first, then recently changed
                    </span>
                    {root && (
                      <Link
                        to={`/drive/${root}`}
                        className="text-primary ml-auto text-xs hover:underline"
                      >
                        Open My Drive
                      </Link>
                    )}
                  </div>
                  <div className="grid gap-3" style={oneLine}>
                    {folderSuggestions.slice(0, cols).map((f) => (
                      <button
                        key={f.id}
                        onClick={() => void openFolder(f.id)}
                        onContextMenu={(e) => openMenu(e, "folder", f)}
                        className={`${card} flex h-16 min-w-0 items-center gap-3.5 px-4`}
                      >
                        <FolderIcon
                          size={28}
                          weight="fill"
                          style={{ color: f.color || undefined }}
                          className={`shrink-0 ${nudge} motion-safe:group-hover/card:-translate-y-0.5 ${f.color ? "" : "text-primary"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium" title={f.name}>
                            {f.name}
                          </div>
                          <div className="text-muted-foreground truncate text-xs">
                            {formatDate(f.updatedAt)}
                          </div>
                        </div>
                        {f.isStarred && (
                          <StarIcon size={14} weight="fill" className="shrink-0 text-yellow-500" />
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {fresh.length > 0 && (
                <section>
                  <div className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-2">
                    <h2 className={sectionLabel}>New, not opened yet</h2>
                    <span className="bg-primary text-primary-foreground rounded-full px-2 py-px text-[11px] font-semibold">
                      {newCount}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      {fresh.length > cols && (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setShowAllNew((v) => !v)}
                        >
                          {showAllNew ? "Show less" : `View all ${newCount}`}
                        </Button>
                      )}
                      <Button size="xs" variant="outline" onClick={markAllSeen}>
                        <ChecksIcon />
                        Mark all as seen
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3" style={oneLine}>
                    {(showAllNew ? fresh : fresh.slice(0, cols)).map((f) => (
                      <button
                        key={f.id}
                        onClick={() => openFile(f)}
                        onContextMenu={(e) => openMenu(e, "file", f)}
                        className={`${card} flex h-13 min-w-0 items-center gap-3 pr-3.5 pl-2.5`}
                      >
                        <span className="bg-muted grid size-8 shrink-0 place-items-center overflow-hidden rounded">
                          <FileThumb file={f} iconSize={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className="group-hover/card:text-primary block truncate text-[13px] font-medium transition-colors duration-200"
                            title={f.name}
                          >
                            {f.name}
                          </span>
                          <span className="text-muted-foreground block text-xs">
                            {formatBytes(f.size)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <div className="flex flex-wrap gap-x-7 gap-y-10">
                {recent.length > 0 && (
                  <section className="min-w-0 flex-[1_1_320px]">
                    <div className="mb-4 flex items-baseline justify-between gap-3">
                      <h2 className={sectionLabel}>Recently opened</h2>
                      <Link to="/recent" className="text-primary text-xs hover:underline">
                        View all
                      </Link>
                    </div>
                    <FileRows
                      files={recent}
                      meta={(f) =>
                        `${f.action === "download" ? "Downloaded" : "Viewed"} ${relativeTime(f.accessedAt)}`
                      }
                      onOpen={setPreview}
                      onMenu={(e, f) => openMenu(e, "file", f)}
                    />
                  </section>
                )}

                {suggestions.length > 0 && (
                  <section className="min-w-0 flex-[1_1_320px]">
                    <div className="mb-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <h2 className={sectionLabel}>Opened often</h2>
                      <span className="text-muted-foreground text-xs">last 30 days</span>
                    </div>
                    <FileRows
                      files={suggestions}
                      meta={(f) => formatBytes(f.size)}
                      onOpen={setPreview}
                      onMenu={(e, f) => openMenu(e, "file", f)}
                    />
                  </section>
                )}

                {lucky && (
                  <section className="flex min-w-0 flex-[1_1_280px] flex-col">
                    <div className="mb-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <h2 className={sectionLabel}>Rediscover</h2>
                      <span className="text-muted-foreground text-xs">a random old file</span>
                    </div>
                    <div className="bg-card flex flex-1 flex-col gap-3.5 rounded-lg border p-4">
                      <button
                        onClick={() => setPreview(lucky)}
                        onContextMenu={(e) => openMenu(e, "file", lucky)}
                        aria-label={`Open ${lucky.name}`}
                        className="bg-muted hover:ring-primary focus-visible:ring-primary grid h-32 place-items-center overflow-hidden rounded-md outline-none transition-shadow duration-200 hover:ring-2 focus-visible:ring-2"
                      >
                        <FileThumb file={lucky} iconSize={40} />
                      </button>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium" title={lucky.name}>
                          {lucky.name}
                        </div>
                        <div className="text-muted-foreground truncate text-xs">
                          Uploaded {formatDate(lucky.createdAt)} · {formatBytes(lucky.size)}
                        </div>
                      </div>
                      <div className="mt-auto flex gap-2">
                        <Button className="flex-1" onClick={shuffle}>
                          <DiceFiveIcon className="transition-transform duration-300 motion-safe:group-hover/button:rotate-90" />
                          Shuffle
                        </Button>
                        <Button
                          className="flex-1"
                          variant="outline"
                          onClick={() => setPreview(lucky)}
                        >
                          Open
                        </Button>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
        {itemMenu}
        <FilePreview
          file={preview}
          onClose={() => setPreview(null)}
          items={allFiles}
          onNavigate={setPreview}
        />

        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) uploadToDrive(e.target.files)
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
            if (e.target.files) uploadToDrive(e.target.files)
            e.target.value = ""
          }}
        />
        <NewFolderDialog
          open={dialog === "folder"}
          onClose={() => setDialog(null)}
          onSubmit={async (name, color, thumbnail) => {
            await createFolder(name, color, thumbnail, root)
            reload()
          }}
        />
        <ImportUrlDialog
          open={dialog === "url"}
          onClose={() => setDialog(null)}
          onSubmit={(url, name) => importUrl(url, name, root).then(() => reload())}
        />
        <SpaceEditorDialog
          mode={dialog === "space" ? { kind: "create" } : null}
          onClose={() => setDialog(null)}
        />
      </main>
    </div>
  )
}

function DriveStats({ quota }: { quota: QuotaInfo }) {
  const pct = quota.total > 0 ? Math.min(100, (quota.used / quota.total) * 100) : 0
  const types = TYPE_ORDER.filter((k) => quota.byType[k] > 0)
  const stats = [
    ["Used", formatBytes(quota.used)],
    ["Free", formatBytes(Math.max(0, quota.total - quota.used))],
    ["Files", types.reduce((n, k) => n + quota.byType[k], 0).toLocaleString()],
  ]
  return (
    <section className="bg-card flex min-w-0 flex-[1.2_1_320px] flex-col justify-between gap-4 rounded-lg border p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={sectionLabel}>Your drive</h2>
        <Link to="/storage" className="text-primary text-xs hover:underline">
          Analyze storage
        </Link>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {stats.map(([name, value]) => (
          <div key={name} className="last:ml-auto last:text-right">
            <div className="text-muted-foreground text-xs">{name}</div>
            <div className="text-[22px] leading-7 font-semibold tracking-tight">{value}</div>
          </div>
        ))}
      </div>
      <div
        role="img"
        aria-label={`${formatBytes(quota.used)} of ${formatBytes(quota.total)} used`}
        title={`${formatBytes(quota.used)} of ${formatBytes(quota.total)} used`}
        className="bg-muted h-2 overflow-hidden rounded-full"
      >
        <div
          className={`h-full rounded-full ${pct >= 80 ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-5 gap-y-1">
        {types.map((k) => (
          <li key={k} className="flex items-center gap-1.5 text-xs">
            <span className={`size-2 shrink-0 rounded-full ${TYPE_META[k].dot}`} />
            <span className="text-muted-foreground flex-1">{TYPE_META[k].label}</span>
            <span className="tabular-nums">{quota.byType[k].toLocaleString()}</span>
            <span className="text-muted-foreground w-16 text-right tabular-nums">
              {formatBytes(quota.bytesByType[k])}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function FileRows<T extends FileItem>({
  files,
  meta,
  onOpen,
  onMenu,
}: {
  files: T[]
  meta: (f: T) => string
  onOpen: (f: T) => void
  onMenu: (e: React.MouseEvent, f: T) => void
}) {
  // Flex rows, not a table: a table cell won't truncate a long name, it widens
  // the table and pushes the meta column out of a narrow list.
  return (
    <div className="divide-y overflow-hidden rounded-lg border">
      {files.map((f) => (
        <button
          key={f.id}
          onClick={() => onOpen(f)}
          onContextMenu={(e) => onMenu(e, f)}
          className="group/row hover:bg-primary/5 focus-visible:bg-accent/40 flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-sm outline-none transition-colors duration-200 [&_svg]:shrink-0"
        >
          {iconFor(f.mimeType, 18, f.name)}
          <span
            className="group-hover/row:text-primary min-w-0 flex-1 truncate transition-colors duration-200"
            title={f.name}
          >
            {f.name}
          </span>
          <span className="text-muted-foreground shrink-0 text-xs">{meta(f)}</span>
        </button>
      ))}
    </div>
  )
}
