import { useEffect, useMemo, useState } from "react"
import { CaretDownIcon, CaretRightIcon, FolderIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Modal } from "@/components/Modal"
import { apiGet } from "@/lib/api"
import { useAuth } from "@/store/auth"

type FolderNode = { id: string; name: string; parentId: string | null }
type TreeResponse = { rootId: string; folders: FolderNode[] }

type Props = {
  open: boolean
  items: { type: "folder" | "file"; id: string }[]
  displayName: string
  currentParentId: string | null // folderId for files, parentId for folders
  onClose: () => void
  onSubmit: (targetFolderId: string) => void | Promise<void>
}

export function MoveDialog({
  open,
  items,
  displayName,
  currentParentId,
  onClose,
  onSubmit,
}: Props) {
  const [tree, setTree] = useState<TreeResponse | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const syncRootId = useAuth((s) => s.user?.syncRootFolderId)

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setBusy(false)
    setErr(null)
    setTree(null)
    apiGet<TreeResponse>("/api/folders/tree/me")
      .then((r) => {
        setTree(r)
        // auto-expand path to current parent
        const byId = new Map(r.folders.map((f) => [f.id, f]))
        const exp = new Set<string>()
        let cur = currentParentId
        while (cur) {
          exp.add(cur)
          cur = byId.get(cur)?.parentId ?? null
        }
        exp.add(r.rootId)
        setExpanded(exp)
      })
      .catch((e) => setErr(e.message))
  }, [open, currentParentId])

  // Folders that can't be the target: any selected folder itself and its
  // descendants, and "Synced Folders" itself, which holds only the synced
  // folders. What's put in one of those goes to every computer that keeps it.
  const forbidden = useMemo(() => {
    if (!tree) return new Set<string>()
    const folderIds = items.filter((i) => i.type === "folder").map((i) => i.id)
    const childrenOf = new Map<string, string[]>()
    for (const f of tree.folders) {
      if (!f.parentId) continue
      if (!childrenOf.has(f.parentId)) childrenOf.set(f.parentId, [])
      childrenOf.get(f.parentId)!.push(f.id)
    }
    const blocked = new Set<string>(folderIds)
    const stack = [...folderIds]
    while (stack.length) {
      const id = stack.pop()!
      for (const c of childrenOf.get(id) ?? []) {
        if (!blocked.has(c)) {
          blocked.add(c)
          stack.push(c)
        }
      }
    }
    if (syncRootId) blocked.add(syncRootId)
    return blocked
  }, [tree, items, syncRootId])

  async function submit() {
    if (!selected || busy) return
    setBusy(true)
    try {
      await onSubmit(selected)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "move_failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="h-[520px]"
      bodyClassName="p-2 text-sm"
      title="Move"
      description={
        <span className="block truncate" title={displayName}>
          {displayName}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!selected || selected === currentParentId || busy}
          >
            {busy ? "Moving…" : "Move"}
          </Button>
        </>
      }
    >
      {err && <div className="text-destructive mb-2 px-2">{err}</div>}
      {!tree ? (
        <div className="text-muted-foreground p-4 text-sm">Loading…</div>
      ) : (
        <FolderTree
          rootId={tree.rootId}
          syncRootId={syncRootId}
          folders={tree.folders}
          selected={selected}
          expanded={expanded}
          forbidden={forbidden}
          currentParentId={currentParentId}
          onSelect={setSelected}
          onToggle={(id) =>
            setExpanded((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }
        />
      )}
    </Modal>
  )
}

function FolderTree({
  rootId,
  syncRootId,
  folders,
  selected,
  expanded,
  forbidden,
  currentParentId,
  onSelect,
  onToggle,
}: {
  rootId: string
  syncRootId?: string
  folders: FolderNode[]
  selected: string | null
  expanded: Set<string>
  forbidden: Set<string>
  currentParentId: string | null
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
    const isForbidden = forbidden.has(id)
    const isCurrent = id === currentParentId
    const isSelected = selected === id

    return (
      <div key={id}>
        <div
          className={`flex items-center gap-1 rounded px-1.5 py-1 ${
            isForbidden ? "text-muted-foreground/60" : "hover:bg-accent/60"
          } ${isSelected ? "bg-accent text-accent-foreground" : ""}`}
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
            className="flex min-w-0 flex-1 items-center gap-1 text-left disabled:cursor-not-allowed"
            disabled={isForbidden}
            aria-current={isSelected ? "true" : undefined}
            title={name}
            onClick={() => onSelect(id)}
          >
            <FolderIcon size={16} weight="fill" className="text-primary shrink-0" />
            <span className="truncate">{name}</span>
            {isCurrent && (
              <span className="text-muted-foreground ml-auto shrink-0 text-xs">current</span>
            )}
          </button>
        </div>
        {isOpen &&
          kids.map((k) =>
            render(k.id, k.name, depth + 1)
          )}
      </div>
    )
  }

  return (
    <div>
      {render(rootId, "My Drive", 0)}
      {/* Only once there is a synced folder to put things in. */}
      {syncRootId && childrenOf.has(syncRootId) && render(syncRootId, "Synced Folders", 0)}
    </div>
  )
}
