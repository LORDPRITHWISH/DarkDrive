import { useEffect, useMemo, useState } from "react"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  CaretDownIcon,
  CaretRightIcon,
  CheckIcon,
  CheckSquareIcon,
  FolderIcon,
  FolderOpenIcon,
  HardDrivesIcon,
  ListBulletsIcon,
  SquareIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Modal } from "@/components/Modal"
import { apiGet } from "@/lib/api"
import { useDrive } from "@/store/drive"
import { FileThumb } from "@/components/file-grid/FileThumb"
import { formatBytes } from "@/lib/format"
import type { Breadcrumb, FileItem, Folder } from "@/lib/types"

type FolderNode = { id: string; name: string; parentId: string | null }
type TreeResponse = { rootId: string; folders: FolderNode[] }
type ContentsResponse = {
  folder: Folder
  folders: Folder[]
  files: FileItem[]
  breadcrumbs: Breadcrumb[]
}
type View = "grid" | "list"

// Add or drop one id, as the updater for a Set held in state.
const flip = (id: string) => (prev: Set<string>) => {
  const next = new Set(prev)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

type Props = {
  open: boolean
  targetFolderId: string
  displayName: string
  onClose: () => void
  onLinked: () => void
}

// Browse your own drive and multi-select files to link (shortcut) into a
// space, without leaving the space page. A folder tree on the left for quick
// jumps, current folder's contents on the right — files toggle, folders
// navigate, and the tick on a folder picks the whole of it (mirrored into the
// space: its subfolders are made there and its files linked into them).
// Selection persists across navigation so you can pick from several folders
// in one pass.
export function LinkFilesDialog({
  open,
  targetFolderId,
  displayName,
  onClose,
  onLinked,
}: Props) {
  const addItemsToSpace = useDrive((s) => s.addItemsToSpace)
  const [tree, setTree] = useState<TreeResponse | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [contents, setContents] = useState<ContentsResponse | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set())
  const [view, setView] = useState<View>("grid")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function goto(folderId: string) {
    setErr(null)
    apiGet<ContentsResponse>(`/api/folders/${folderId}/contents`)
      .then((data) => {
        setContents(data)
        setExpanded((prev) => {
          const next = new Set(prev)
          for (const c of data.breadcrumbs) next.add(c.id)
          return next
        })
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "failed"))
  }

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    setSelectedFolders(new Set())
    setBusy(false)
    setErr(null)
    setContents(null)
    setTree(null)
    setExpanded(new Set())
    apiGet<TreeResponse>("/api/folders/tree/me")
      .then(setTree)
      .catch((e) => setErr(e instanceof Error ? e.message : "failed"))
    goto("root")
  }, [open])

  const toggleFile = (id: string) => setSelected(flip(id))
  const toggleFolder = (id: string) => setSelectedFolders(flip(id))
  const count = selected.size + selectedFolders.size

  const allSelectedHere =
    !!contents && contents.files.length > 0 && contents.files.every((f) => selected.has(f.id))

  function toggleAllHere() {
    if (!contents) return
    setSelected((prev) => {
      const next = new Set(prev)
      for (const f of contents.files) {
        if (allSelectedHere) next.delete(f.id)
        else next.add(f.id)
      }
      return next
    })
  }

  async function submit() {
    if (count === 0 || busy) return
    setBusy(true)
    try {
      await addItemsToSpace(
        [
          ...Array.from(selectedFolders, (id) => ({ type: "folder" as const, id })),
          ...Array.from(selected, (id) => ({ type: "file" as const, id })),
        ],
        targetFolderId
      )
      onLinked()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="6xl"
      className="h-160"
      bodyClassName="flex flex-col sm:flex-row"
      scrollBody={false}
      title="Link files or folders"
      description={`Pick files, or tick whole folders, from your drive to link into ${displayName}. Originals stay put.`}
      footer={
        <>
          <span className="text-muted-foreground mr-auto text-xs">
            {count > 0 ? `${count} selected` : "Nothing selected"}
          </span>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={count === 0 || busy}>
            {busy ? "Linking…" : count === 0 ? "Link" : `Link ${count} item${count === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      {/* Folder tree */}
      <ScrollArea className="bg-muted/30 max-h-36 shrink-0 border-b sm:max-h-none sm:w-56 sm:border-r sm:border-b-0">
        <div className="flex flex-col p-2">
          <div className="text-muted-foreground flex items-center gap-1.5 px-1.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider">
            <HardDrivesIcon size={12} />
            Your drive
          </div>
          {!tree ? (
            <div className="text-muted-foreground p-2 text-xs">Loading…</div>
          ) : (
            <FolderTree
              rootId={tree.rootId}
              folders={tree.folders}
              selectedId={contents?.folder.id ?? null}
              expanded={expanded}
              onSelect={goto}
              onToggle={(id) => setExpanded(flip(id))}
            />
          )}
        </div>
      </ScrollArea>

      {/* Current folder */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {contents && (
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
            <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
              {contents.breadcrumbs.map((c, i) => (
                <div key={c.id} className="flex min-w-0 items-center gap-1">
                  {i > 0 && <CaretRightIcon size={10} className="shrink-0" />}
                  <button
                    onClick={() => goto(c.id)}
                    className="hover:text-foreground max-w-28 truncate hover:underline"
                  >
                    {c.name}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {contents.files.length > 0 && (
                <button
                  onClick={toggleAllHere}
                  className="text-primary text-xs font-medium hover:underline"
                >
                  {allSelectedHere ? "Deselect all" : "Select all"}
                </button>
              )}
              <div className="bg-border h-4 w-px" />
              <div className="flex items-center gap-0.5">
                <Button
                  size="sm"
                  variant={view === "grid" ? "default" : "ghost"}
                  className="h-6 w-6 p-0"
                  onClick={() => setView("grid")}
                  title="Grid view"
                  aria-label="Grid view"
                  aria-pressed={view === "grid"}
                >
                  <SquaresFourIcon size={13} />
                </Button>
                <Button
                  size="sm"
                  variant={view === "list" ? "default" : "ghost"}
                  className="h-6 w-6 p-0"
                  onClick={() => setView("list")}
                  title="List view"
                  aria-label="List view"
                  aria-pressed={view === "list"}
                >
                  <ListBulletsIcon size={13} />
                </Button>
              </div>
            </div>
          </div>
        )}

        <ScrollArea className="min-h-0 flex-1">
          {err && <div className="text-destructive p-3 text-sm">{err}</div>}
          {!contents ? (
            <div className="text-muted-foreground p-6 text-sm">Loading…</div>
          ) : contents.folders.length === 0 && contents.files.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 p-12 text-center text-sm">
              <FolderOpenIcon size={28} className="opacity-40" />
              Empty folder
            </div>
          ) : view === "grid" ? (
            <GridView
              folders={contents.folders}
              files={contents.files}
              selected={selected}
              selectedFolders={selectedFolders}
              onOpenFolder={goto}
              onToggleFile={toggleFile}
              onToggleFolder={toggleFolder}
            />
          ) : (
            <ListView
              folders={contents.folders}
              files={contents.files}
              selected={selected}
              selectedFolders={selectedFolders}
              onOpenFolder={goto}
              onToggleFile={toggleFile}
              onToggleFolder={toggleFolder}
            />
          )}
        </ScrollArea>
      </div>
    </Modal>
  )
}

function GridView({
  folders,
  files,
  selected,
  selectedFolders,
  onOpenFolder,
  onToggleFile,
  onToggleFolder,
}: {
  folders: Folder[]
  files: FileItem[]
  selected: Set<string>
  selectedFolders: Set<string>
  onOpenFolder: (id: string) => void
  onToggleFile: (id: string) => void
  onToggleFolder: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2 p-3">
      {folders.map((f) => {
        const isSelected = selectedFolders.has(f.id)
        return (
          // Two buttons side by side, not one inside the other: the tile opens
          // the folder, the tick in its corner picks the whole of it. The tick
          // is always shown (no hover on a phone, and nothing else says a
          // folder can be picked).
          <div key={f.id} className="relative">
            <button
              onClick={() => onOpenFolder(f.id)}
              className={`flex w-full flex-col items-center gap-1.5 rounded-lg border p-1.5 transition-colors ${
                isSelected
                  ? "border-primary bg-accent/50"
                  : "hover:border-primary/40 hover:bg-accent/40 border-transparent"
              }`}
            >
              <div className="bg-muted grid aspect-square w-full place-items-center rounded-lg">
                <FolderIcon size={30} weight="fill" className="text-primary" />
              </div>
              <div className="w-full truncate text-center text-xs font-medium" title={f.name}>
                {f.name}
              </div>
            </button>
            <button
              onClick={() => onToggleFolder(f.id)}
              aria-pressed={isSelected}
              aria-label={`Link the whole folder ${f.name}`}
              title="Link the whole folder"
              className="group/tick absolute right-1.5 top-1.5 grid size-7 place-items-center"
            >
              <span
                className={`grid h-4.5 w-4.5 place-items-center rounded-full backdrop-blur transition-colors ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-background/80 ring-border group-hover/tick:text-muted-foreground text-transparent ring-1"
                }`}
              >
                <CheckIcon size={11} weight="bold" />
              </span>
            </button>
          </div>
        )
      })}
      {files.map((f) => {
        const isSelected = selected.has(f.id)
        return (
          <button
            key={f.id}
            onClick={() => onToggleFile(f.id)}
            aria-pressed={isSelected}
            className={`group flex flex-col items-center gap-1.5 rounded-lg border p-1.5 transition-colors ${
              isSelected
                ? "border-primary bg-accent/50"
                : "hover:border-primary/40 hover:bg-accent/40 border-transparent"
            }`}
          >
            <div className="bg-muted relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg">
              <FileThumb file={f} iconSize={30} />
              <div
                className={`absolute right-1 top-1 grid h-4.5 w-4.5 place-items-center rounded-full backdrop-blur transition-opacity ${
                  isSelected
                    ? "bg-primary text-primary-foreground opacity-100"
                    : "bg-background/80 text-muted-foreground opacity-0 group-hover:opacity-100"
                }`}
              >
                <CheckIcon size={11} weight="bold" />
              </div>
            </div>
            <div className="w-full truncate text-center text-xs font-medium" title={f.name}>
              {f.name}
            </div>
            <div className="text-muted-foreground w-full truncate text-center text-[10px]">
              {formatBytes(f.size)}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function ListView({
  folders,
  files,
  selected,
  selectedFolders,
  onOpenFolder,
  onToggleFile,
  onToggleFolder,
}: {
  folders: Folder[]
  files: FileItem[]
  selected: Set<string>
  selectedFolders: Set<string>
  onOpenFolder: (id: string) => void
  onToggleFile: (id: string) => void
  onToggleFolder: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-0.5 p-2">
      {folders.map((f) => {
        const isSelected = selectedFolders.has(f.id)
        return (
          <div
            key={f.id}
            className={`flex items-center gap-2.5 rounded-md px-2 ${
              isSelected ? "bg-accent" : "hover:bg-accent/50"
            }`}
          >
            <button
              onClick={() => onToggleFolder(f.id)}
              aria-pressed={isSelected}
              aria-label={`Link the whole folder ${f.name}`}
              title="Link the whole folder"
              className="shrink-0 py-1.5"
            >
              {isSelected ? (
                <CheckSquareIcon size={18} weight="fill" className="text-primary" />
              ) : (
                <SquareIcon size={18} className="text-muted-foreground/40" />
              )}
            </button>
            <button
              onClick={() => onOpenFolder(f.id)}
              className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left"
            >
              <FolderIcon size={18} weight="fill" className="text-primary shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
              <CaretRightIcon size={12} className="text-muted-foreground shrink-0" />
            </button>
          </div>
        )
      })}
      {files.map((f) => {
        const isSelected = selected.has(f.id)
        return (
          <button
            key={f.id}
            onClick={() => onToggleFile(f.id)}
            aria-pressed={isSelected}
            className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${
              isSelected ? "bg-accent" : "hover:bg-accent/50"
            }`}
          >
            {isSelected ? (
              <CheckSquareIcon size={18} weight="fill" className="text-primary shrink-0" />
            ) : (
              <SquareIcon size={18} className="text-muted-foreground/40 shrink-0" />
            )}
            <span className="bg-muted grid size-7 shrink-0 place-items-center overflow-hidden rounded">
              <FileThumb file={f} iconSize={16} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {formatBytes(f.size)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function FolderTree({
  rootId,
  folders,
  selectedId,
  expanded,
  onSelect,
  onToggle,
}: {
  rootId: string
  folders: FolderNode[]
  selectedId: string | null
  expanded: Set<string>
  onSelect: (id: string) => void
  onToggle: (id: string) => void
}) {
  const childrenOf = useMemo(() => {
    const m = new Map<string, FolderNode[]>()
    for (const f of folders) {
      const key = f.parentId ?? "__root__"
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(f)
    }
    for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return m
  }, [folders])

  function render(id: string, name: string, depth: number): React.ReactNode {
    const kids = childrenOf.get(id) ?? []
    const hasKids = kids.length > 0
    const isOpen = expanded.has(id)
    const isSelected = selectedId === id

    return (
      <div key={id}>
        <div
          className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors ${
            isSelected
              ? "bg-primary/10 text-primary font-medium"
              : "hover:bg-accent/60 text-foreground"
          }`}
          style={{ paddingLeft: depth * 14 + 6 }}
        >
          {hasKids ? (
            <button
              className="shrink-0 rounded p-0.5 hover:bg-black/10"
              aria-label={`${isOpen ? "Collapse" : "Expand"} ${name}`}
              aria-expanded={isOpen}
              onClick={() => onToggle(id)}
            >
              {isOpen ? <CaretDownIcon size={12} /> : <CaretRightIcon size={12} />}
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}
          {/* A button, not a clickable row, so a folder can be picked from the keyboard. */}
          <button
            className="flex min-w-0 flex-1 items-center gap-1 text-left"
            aria-current={isSelected ? "true" : undefined}
            title={name}
            onClick={() => onSelect(id)}
          >
            <FolderIcon
              size={15}
              weight="fill"
              className={isSelected ? "text-primary shrink-0" : "text-muted-foreground shrink-0"}
            />
            <span className="truncate">{name}</span>
          </button>
        </div>
        {isOpen && kids.map((k) => render(k.id, k.name, depth + 1))}
      </div>
    )
  }

  return <div>{render(rootId, "My Drive", 0)}</div>
}
