import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeftIcon,
  CaretDownIcon,
  CaretRightIcon,
  ChartDonutIcon,
  FolderIcon,
  ListBulletsIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
import { FilePreview } from "@/components/FilePreview"
import { HoverName } from "@/components/HoverName"
import { useItemMenu } from "@/components/ItemMenu"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { apiGet } from "@/lib/api"
import { formatBytes, formatDate } from "@/lib/format"
import { iconFor } from "@/lib/fileIcon"
import { fileCategory, TYPE_META, TYPE_ORDER } from "@/lib/fileType"
import {
  buildFolderTree,
  squarifyNested,
  type NestedNode,
  type NestedRect,
} from "@/lib/treemap"
import { useGridKeyNav } from "@/lib/useGridKeyNav"
import type { FileItem, Folder, StorageData } from "@/lib/types"

type Category = (typeof TYPE_ORDER)[number]
type CatFilter = Category | "all"
// What a tile/row stands for: a whole type, a folder subtree, or one file.
type Node = { chain: string[]; path: string } & (
  | { kind: "cat"; cat: Category; label: string; count: number }
  | { kind: "folder"; folder: Folder; count: number }
  | { kind: "file"; file: FileItem; cat: Category }
)

type Tree = ReturnType<typeof buildFolderTree<Folder, FileItem>>

export function StoragePage() {
  const [data, setData] = useState<StorageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"treemap" | "list">("treemap")
  const [group, setGroup] = useState<"folder" | "type">("folder")
  const [cat, setCat] = useState<CatFilter>("all")
  const [path, setPath] = useState<Folder[]>([])
  const [preview, setPreview] = useState<FileItem | null>(null)
  // Folder row being hovered in the tree: its subtree stays lit in the
  // treemap while everything else dims, so "what is inside what" is visible
  // without clicking anything.
  const [hoverId, setHoverId] = useState<string | null>(null)
  const nav = useNavigate()
  const { openMenu, itemMenu } = useItemMenu({ onPreview: setPreview, onChanged: load })
  const contentRef = useRef<HTMLDivElement>(null)
  useGridKeyNav(contentRef)

  function load() {
    setLoading(true)
    apiGet<StorageData>("/api/me/storage")
      .then(setData)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const files = useMemo(() => data?.files ?? [], [data])
  const folders = useMemo(() => data?.folders ?? [], [data])

  const catOf = useMemo(() => {
    const m = new Map<string, Category>()
    for (const f of files) m.set(f.id, fileCategory(f.mimeType, f.name))
    return m
  }, [files])

  // Per-type totals always cover the whole drive — the chips have to keep
  // showing what a type costs even while it isn't the selected one.
  const totals = useMemo(() => {
    const t = Object.fromEntries(
      TYPE_ORDER.map((c) => [c, { bytes: 0, count: 0 }])
    ) as Record<Category, { bytes: number; count: number }>
    let used = 0
    for (const f of files) {
      const c = catOf.get(f.id)!
      t[c].bytes += f.size
      t[c].count += 1
      used += f.size
    }
    return { byCat: t, used }
  }, [files, catOf])

  const filtered = useMemo(
    () => (cat === "all" ? files : files.filter((f) => catOf.get(f.id) === cat)),
    [files, cat, catOf]
  )

  // Full "A / B / C" path per folder, so every tile and row can say where it
  // sits without walking parents again.
  const pathOf = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, f]))
    const cache = new Map<string, string>()
    const walk = (id: string): string => {
      const hit = cache.get(id)
      if (hit !== undefined) return hit
      cache.set(id, "") // cycle guard
      const f = byId.get(id)
      if (!f) return ""
      const parent = f.parentId && byId.has(f.parentId) ? walk(f.parentId) : ""
      const full = parent ? `${parent} / ${f.name}` : f.name
      cache.set(id, full)
      return full
    }
    for (const f of folders) walk(f.id)
    return cache
  }, [folders])

  // Folder tree over the *filtered* files, so picking a type also answers
  // "and which folders is it sitting in?".
  const tree = useMemo(() => buildFolderTree(folders, filtered), [folders, filtered])

  // A single top-level folder (the usual "My Drive" case) is scenery, not a
  // choice — start inside it.
  const effectivePath = useMemo(() => {
    const roots = tree.children.get(null) ?? []
    const bare = (tree.filesIn.get(null) ?? []).length === 0
    return path.length === 0 && roots.length === 1 && bare ? roots : path
  }, [path, tree])
  const currentId = effectivePath.at(-1)?.id ?? null

  // Nested tiles: types holding their files, or folders holding their subtree.
  const nodes: NestedNode<Node>[] = useMemo(() => {
    const fileNode = (f: FileItem, chain: string[] = []): NestedNode<Node> => ({
      value: f.size,
      data: {
        kind: "file",
        file: f,
        cat: catOf.get(f.id)!,
        chain,
        path: pathOf.get(f.folderId) ?? "",
      },
    })
    if (group === "type") {
      if (cat !== "all") return filtered.map((f) => fileNode(f))
      const byCat = new Map<Category, FileItem[]>()
      for (const f of files) {
        const c = catOf.get(f.id)!
        byCat.set(c, [...(byCat.get(c) ?? []), f])
      }
      return TYPE_ORDER.filter((c) => totals.byCat[c].bytes > 0).map((c) => ({
        value: totals.byCat[c].bytes,
        data: {
          kind: "cat" as const,
          cat: c,
          label: TYPE_META[c].label,
          count: totals.byCat[c].count,
          chain: [],
          path: "",
        },
        children: (byCat.get(c) ?? []).map((f) => fileNode(f)),
      }))
    }
    const folderNode = (f: Folder, parents: string[]): NestedNode<Node> => {
      const chain = [...parents, f.id]
      return {
        value: tree.size.get(f.id) ?? 0,
        data: {
          kind: "folder",
          folder: f,
          count: tree.count.get(f.id) ?? 0,
          chain,
          path: pathOf.get(f.id) ?? f.name,
        },
        children: [
          ...(tree.children.get(f.id) ?? []).map((c) => folderNode(c, chain)),
          ...(tree.filesIn.get(f.id) ?? []).map((file) => fileNode(file, chain)),
        ],
      }
    }
    const base: string[] = []
    for (let cur = currentId ? tree.byId.get(currentId) : undefined; cur; ) {
      base.unshift(cur.id)
      cur = cur.parentId ? tree.byId.get(cur.parentId) : undefined
    }
    return [
      ...(tree.children.get(currentId) ?? []).map((f) => folderNode(f, base)),
      ...(tree.filesIn.get(currentId) ?? []).map((f) => fileNode(f, base)),
    ]
  }, [group, cat, files, filtered, catOf, totals, tree, currentId, pathOf])

  const shown = nodes.reduce((s, n) => s + n.value, 0)
  const quota = data?.quota ?? 0
  const canGoBack = group === "folder" ? effectivePath.length > 1 : cat !== "all"

  // Ancestor chain of a folder, so selecting one anywhere (tree row, tile)
  // rebuilds the breadcrumb path in one shot.
  function chainOf(id: string): Folder[] {
    const out: Folder[] = []
    let cur = tree.byId.get(id)
    while (cur) {
      out.unshift(cur)
      cur = cur.parentId ? tree.byId.get(cur.parentId) : undefined
    }
    return out
  }

  function goBack() {
    if (group === "folder") setPath(effectivePath.slice(0, -1))
    else setCat("all")
  }

  function openNode(n: Node) {
    if (n.kind === "cat") setCat(n.cat)
    else if (n.kind === "folder") setPath(chainOf(n.folder.id))
    else setPreview(n.file)
  }

  function menuFor(e: React.MouseEvent, n: Node) {
    if (n.kind === "folder") openMenu(e, "folder", n.folder)
    else if (n.kind === "file") openMenu(e, "file", n.file)
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <SidebarToggle />
            <ChartDonutIcon size={18} className="text-primary" />
            <div className="text-sm font-semibold">Storage</div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={view === "treemap" ? "default" : "ghost"}
              onClick={() => setView("treemap")}
              title="Treemap"
            >
              <SquaresFourIcon size={16} />
            </Button>
            <Button
              size="sm"
              variant={view === "list" ? "default" : "ghost"}
              onClick={() => setView("list")}
              title="List view"
            >
              <ListBulletsIcon size={16} />
            </Button>
            <HeaderActions onReload={load} />
          </div>
        </header>

        <div className="border-b px-4 py-4 md:px-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-2xl font-semibold tracking-tight">
              {formatBytes(totals.used)}
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                of {formatBytes(quota)} used
                {quota > 0 && ` · ${((totals.used / quota) * 100).toFixed(1)}%`}
              </span>
            </div>
            <div className="text-muted-foreground text-xs">
              {files.length.toLocaleString()} files · {folders.length.toLocaleString()} folders
            </div>
          </div>
          <div className="bg-muted flex h-3 w-full overflow-hidden rounded-full">
            {TYPE_ORDER.map((c) => {
              const w = quota > 0 ? (totals.byCat[c].bytes / quota) * 100 : 0
              if (w <= 0) return null
              return (
                <button
                  key={c}
                  onClick={() => setCat(cat === c ? "all" : c)}
                  title={`${TYPE_META[c].label} — ${formatBytes(totals.byCat[c].bytes)}`}
                  style={{ width: `${w}%` }}
                  className={`${TYPE_META[c].bar} h-full transition-opacity hover:opacity-80`}
                />
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip active={cat === "all"} onClick={() => setCat("all")}>
              All · {formatBytes(totals.used)}
            </Chip>
            {TYPE_ORDER.map((c) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(cat === c ? "all" : c)}>
                <span className={`${TYPE_META[c].dot} h-2 w-2 rounded-full`} />
                {TYPE_META[c].label} · {formatBytes(totals.byCat[c].bytes)}
                <span className="text-muted-foreground">({totals.byCat[c].count})</span>
              </Chip>
            ))}
          </div>
        </div>

        {view === "treemap" && (
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 md:px-6">
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={group === "folder" ? "secondary" : "ghost"}
                onClick={() => setGroup("folder")}
              >
                By folder
              </Button>
              <Button
                size="sm"
                variant={group === "type" ? "secondary" : "ghost"}
                onClick={() => setGroup("type")}
              >
                By type
              </Button>
            </div>
            {canGoBack && (
              <Button size="sm" variant="ghost" onClick={goBack}>
                <ArrowLeftIcon size={14} /> Back
              </Button>
            )}
            <div className="text-muted-foreground min-w-0 truncate text-xs">
              {group === "folder"
                ? effectivePath.map((f) => f.name).join(" / ") || "All folders"
                : cat === "all"
                  ? "All types"
                  : TYPE_META[cat].label}
              {" · "}
              {formatBytes(shown)}
            </div>
          </div>
        )}

        <div ref={contentRef} className="flex-1 overflow-auto px-4 py-5 md:px-6">
          {loading ? (
            <div className="text-muted-foreground py-20 text-center text-sm">Loading…</div>
          ) : files.length === 0 ? (
            <div className="text-muted-foreground py-20 text-center text-sm">
              Nothing stored yet. Upload some files and this fills in.
            </div>
          ) : view === "treemap" ? (
            <div className="flex flex-col gap-4">
              {group === "folder" && (
                <FolderTree
                  tree={tree}
                  selectedId={currentId}
                  onSelect={(f) => setPath(chainOf(f.id))}
                  onHover={setHoverId}
                  onMenu={(e, f) => openMenu(e, "folder", f)}
                />
              )}
              <Treemap
                nodes={nodes}
                highlight={hoverId}
                onOpen={openNode}
                onMenu={menuFor}
              />
            </div>
          ) : (
            <FileList
              files={filtered}
              total={totals.used}
              folderPath={(id) => pathOf.get(id) ?? null}
              onOpen={setPreview}
              onOpenLocation={(id) => nav(`/drive/${id}`)}
              onMenu={(e, f) => openMenu(e, "file", f)}
            />
          )}
        </div>

        {itemMenu}
        <FilePreview
          file={preview}
          onClose={() => setPreview(null)}
          items={filtered}
          onNavigate={setPreview}
        />
      </main>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
      }`}
    >
      {children}
    </button>
  )
}

// WizTree-style expandable tree: every folder with its share of its parent,
// rolled-up size and item count. Selecting a row re-roots the treemap below.
function FolderTree({
  tree,
  selectedId,
  onSelect,
  onHover,
  onMenu,
}: {
  tree: Tree
  selectedId: string | null
  onSelect: (f: Folder) => void
  onHover: (id: string | null) => void
  onMenu: (e: React.MouseEvent, f: Folder) => void
}) {
  const roots = tree.children.get(null) ?? []
  // Open by default: the top level, and the chain down to whatever the treemap
  // is showing. `override` holds only the rows the user has clicked, so a
  // selection made elsewhere can't re-open something they collapsed.
  const [override, setOverride] = useState<Map<string, boolean>>(new Map())
  const auto = useMemo(() => {
    const ids = new Set((tree.children.get(null) ?? []).map((f) => f.id))
    let cur = selectedId ? tree.byId.get(selectedId) : undefined
    while (cur) {
      ids.add(cur.id)
      cur = cur.parentId ? tree.byId.get(cur.parentId) : undefined
    }
    return ids
  }, [selectedId, tree])

  const isOpen = (id: string) => override.get(id) ?? auto.has(id)

  function toggle(id: string) {
    setOverride((prev) => new Map(prev).set(id, !isOpen(id)))
  }

  function rows(list: Folder[], parentBytes: number, depth: number): React.ReactNode[] {
    return [...list]
      .sort((a, b) => (tree.size.get(b.id) ?? 0) - (tree.size.get(a.id) ?? 0))
      .flatMap((f) => {
        const bytes = tree.size.get(f.id) ?? 0
        const kids = tree.children.get(f.id) ?? []
        const open = isOpen(f.id)
        const pct = parentBytes > 0 ? (bytes / parentBytes) * 100 : 0
        return [
          <TableRow
            key={f.id}
            tabIndex={0}
            aria-selected={f.id === selectedId}
            className={`focus-visible:bg-accent/40 cursor-pointer outline-none last:border-b-0 ${
              f.id === selectedId ? "bg-accent/60" : ""
            }`}
            onClick={() => onSelect(f)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSelect(f)
            }}
            onMouseEnter={() => onHover(f.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(f.id)}
            onBlur={() => onHover(null)}
            onContextMenu={(e) => onMenu(e, f)}
          >
            <TableCell className="p-0 py-1 pl-2">
              <div className="flex items-center gap-1" style={{ paddingLeft: depth * 14 }}>
                {kids.length > 0 ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggle(f.id)
                    }}
                    aria-label={open ? "Collapse" : "Expand"}
                    className="hover:bg-accent text-muted-foreground rounded p-0.5"
                  >
                    {open ? <CaretDownIcon size={12} /> : <CaretRightIcon size={12} />}
                  </button>
                ) : (
                  <span className="w-[1.125rem]" />
                )}
                <FolderIcon
                  size={14}
                  weight="fill"
                  style={{ color: f.color || undefined }}
                  className={f.color ? "shrink-0" : "text-primary shrink-0"}
                />
                <span className="truncate text-sm">{f.name}</span>
              </div>
            </TableCell>
            <TableCell className="p-0 py-1">
              <div className="flex items-center gap-2 pr-3">
                <div className="bg-muted h-1.5 w-full max-w-28 overflow-hidden rounded-full">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-muted-foreground w-11 shrink-0 text-right text-xs tabular-nums">
                  {pct.toFixed(1)}%
                </span>
              </div>
            </TableCell>
            <TableCell className="p-0 py-1 text-right text-sm tabular-nums">
              {formatBytes(bytes)}
            </TableCell>
            <TableCell className="text-muted-foreground p-0 py-1 pr-3 text-right text-sm tabular-nums">
              {(tree.count.get(f.id) ?? 0).toLocaleString()}
            </TableCell>
          </TableRow>,
          ...(open ? rows(kids, bytes, depth + 1) : []),
        ]
      })
  }

  if (roots.length === 0) return null
  return (
    <div className="max-h-72 overflow-auto rounded-lg border">
      <Table>
        <TableHeader className="bg-card sticky top-0 z-10">
          <TableRow className="hover:bg-transparent">
            <TableHead className="p-0 py-2 pl-2">Folder</TableHead>
            <TableHead className="p-0 py-2">% of parent</TableHead>
            <TableHead className="p-0 py-2 text-right">Size</TableHead>
            <TableHead className="p-0 py-2 pr-3 text-right">Items</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{rows(roots, tree.size.get(null) ?? 0, 0)}</TableBody>
      </Table>
    </div>
  )
}

function Treemap({
  nodes,
  highlight,
  onOpen,
  onMenu,
}: {
  nodes: NestedNode<Node>[]
  highlight: string | null
  onOpen: (n: Node) => void
  onMenu: (e: React.MouseEvent, n: Node) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) =>
      setBox({ w: entry!.contentRect.width, h: entry!.contentRect.height })
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rects = useMemo(
    () => squarifyNested(nodes, box.w, box.h),
    [nodes, box]
  )

  return (
    <div ref={boxRef} className="bg-muted/30 relative h-[min(70vh,42rem)] w-full rounded-lg">
      {rects.map((r) => (
        <Tile
          key={`${r.depth}:${keyOf(r.data)}`}
          rect={r}
          dim={highlight !== null && !r.data.chain.includes(highlight)}
          onOpen={onOpen}
          onMenu={onMenu}
        />
      ))}
      {rects.length === 0 && box.w > 0 && (
        <div className="text-muted-foreground grid h-full place-items-center text-sm">
          Nothing here.
        </div>
      )}
    </div>
  )
}

function keyOf(n: Node) {
  return n.kind === "cat" ? n.cat : n.kind === "folder" ? n.folder.id : n.file.id
}

// Two shapes, deliberately unlike each other: a folder that still has room for
// its contents is drawn as an empty titled frame (its children are painted on
// top of it as separate tiles), while anything terminal is a solid coloured
// block. That contrast is what makes containment readable at a glance.
function Tile({
  rect,
  dim,
  onOpen,
  onMenu,
}: {
  rect: NestedRect<Node>
  dim: boolean
  onOpen: (n: Node) => void
  onMenu: (e: React.MouseEvent, n: Node) => void
}) {
  const n = rect.data
  const name = n.kind === "cat" ? n.label : n.kind === "folder" ? n.folder.name : n.file.name
  const size = formatBytes(rect.value)
  const title =
    n.kind === "file"
      ? `${name}\n${size}${n.path ? `\nin ${n.path}` : ""}`
      : `${n.kind === "folder" ? n.path || name : name}\n${size} · ${n.count} files`
  const common = `absolute overflow-hidden text-left outline-none transition-opacity focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-foreground ${
    dim ? "opacity-20" : ""
  }`
  const box = { left: rect.x, top: rect.y, width: rect.w, height: rect.h }

  if (!rect.leaf) {
    const tint = n.kind === "folder" ? "bg-primary" : TYPE_META[n.cat].bar
    return (
      <button
        onClick={() => onOpen(n)}
        onContextMenu={(e) => onMenu(e, n)}
        title={title}
        style={box}
        className={`${common} border-primary/45 hover:border-primary rounded-md border-2 shadow-sm`}
      >
        {/* Faint wash over the whole frame: the gaps between children read as
            "this folder", not as background. */}
        <span className={`${tint} absolute inset-0 opacity-10`} aria-hidden />
        <span className="bg-card/90 text-foreground absolute inset-x-0 top-0 flex h-5 items-center gap-1 border-b px-1 text-[0.6875rem] font-semibold">
          {n.kind === "folder" ? (
            <FolderIcon
              size={11}
              weight="fill"
              style={{ color: n.folder.color || undefined }}
              className={n.folder.color ? "shrink-0" : "text-primary shrink-0"}
            />
          ) : (
            <span className={`${tint} h-2 w-2 shrink-0 rounded-full`} />
          )}
          <span className="truncate">{name}</span>
          <span className="text-muted-foreground ml-auto shrink-0 pl-1 font-normal tabular-nums">
            {size}
          </span>
        </span>
      </button>
    )
  }

  const color = n.kind === "folder" ? "bg-primary" : TYPE_META[n.cat].bar
  const roomy = rect.w > 46 && rect.h > 18
  return (
    <button
      onClick={() => onOpen(n)}
      onContextMenu={(e) => onMenu(e, n)}
      title={title}
      style={box}
      className={`${common} ${color} border-background/80 rounded-sm border text-white/95 hover:brightness-110`}
    >
      {roomy && (
        <span className="flex items-center gap-1 px-1 pt-0.5 text-[0.6875rem] font-medium drop-shadow-sm">
          {n.kind === "folder" && <FolderIcon size={11} weight="fill" className="shrink-0" />}
          <span className="truncate">{name}</span>
        </span>
      )}
      {roomy && rect.h > 32 && (
        <span className="block truncate px-1 text-[0.625rem] text-white/80">
          {size}
          {n.kind !== "file" && ` · ${n.count} files`}
        </span>
      )}
    </button>
  )
}

function FileList({
  files,
  total,
  folderPath,
  onOpen,
  onOpenLocation,
  onMenu,
}: {
  files: FileItem[]
  total: number
  folderPath: (id: string) => string | null
  onOpen: (f: FileItem) => void
  onOpenLocation: (folderId: string) => void
  onMenu: (e: React.MouseEvent, f: FileItem) => void
}) {
  if (files.length === 0)
    return (
      <div className="text-muted-foreground py-20 text-center text-sm">
        No files of this type.
      </div>
    )
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="p-0 py-2 pl-3">Name</TableHead>
            <TableHead className="hidden p-0 py-2 md:table-cell">Location</TableHead>
            <TableHead className="hidden p-0 py-2 lg:table-cell">Modified</TableHead>
            <TableHead className="p-0 py-2">Share of drive</TableHead>
            <TableHead className="p-0 py-2 pr-3 text-right">Size</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((f) => {
            const pct = total > 0 ? (f.size / total) * 100 : 0
            return (
              <TableRow
                key={f.id}
                tabIndex={0}
                className="focus-visible:bg-accent/40 cursor-pointer outline-none last:border-b-0"
                onClick={() => onOpen(f)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpen(f)
                }}
                onContextMenu={(e) => onMenu(e, f)}
              >
                <TableCell className="p-0 py-2 pl-3">
                  <div className="flex items-center gap-2">
                    {iconFor(f.mimeType, 18, f.name)}
                    <HoverName as="span" name={f.name} className="min-w-0 truncate" />
                  </div>
                </TableCell>
                <TableCell className="hidden p-0 py-2 md:table-cell">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenLocation(f.folderId)
                    }}
                    title={folderPath(f.folderId) ?? undefined}
                    className="text-muted-foreground hover:text-foreground block max-w-56 truncate text-left hover:underline"
                  >
                    {folderPath(f.folderId) ?? "—"}
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground hidden p-0 py-2 lg:table-cell">
                  {formatDate(f.updatedAt)}
                </TableCell>
                <TableCell className="p-0 py-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-muted h-1.5 w-24 overflow-hidden rounded-full">
                      <div
                        className={`${TYPE_META[fileCategory(f.mimeType, f.name)].bar} h-full rounded-full`}
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground w-10 text-right text-xs">
                      {pct < 0.1 ? "<0.1" : pct.toFixed(1)}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="p-0 py-2 pr-3 text-right tabular-nums">
                  {formatBytes(f.size)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
