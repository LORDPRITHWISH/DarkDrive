import { useEffect, useMemo, useState } from "react"
import { CaretDownIcon, CaretRightIcon, FolderIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { apiGet } from "@/lib/api"

type FolderNode = { id: string; name: string; parentId: string | null }
type TreeResponse = { rootId: string; folders: FolderNode[] }

type Props = {
  open: boolean
  itemType: "folder" | "file"
  itemId: string
  itemName: string
  currentParentId: string | null // folderId for files, parentId for folders
  onClose: () => void
  onSubmit: (targetFolderId: string) => void | Promise<void>
}

export function MoveDialog({
  open,
  itemType,
  itemId,
  itemName,
  currentParentId,
  onClose,
  onSubmit,
}: Props) {
  const [tree, setTree] = useState<TreeResponse | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

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

  // Folders that can't be the target: the item itself (if folder) and its descendants.
  const forbidden = useMemo(() => {
    if (!tree || itemType !== "folder") return new Set<string>()
    const childrenOf = new Map<string, string[]>()
    for (const f of tree.folders) {
      if (!f.parentId) continue
      if (!childrenOf.has(f.parentId)) childrenOf.set(f.parentId, [])
      childrenOf.get(f.parentId)!.push(f.id)
    }
    const blocked = new Set<string>([itemId])
    const stack = [itemId]
    while (stack.length) {
      const id = stack.pop()!
      for (const c of childrenOf.get(id) ?? []) {
        if (!blocked.has(c)) {
          blocked.add(c)
          stack.push(c)
        }
      }
    }
    return blocked
  }, [tree, itemType, itemId])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [open, onClose])

  if (!open) return null

  async function submit() {
    if (!selected || busy) return
    setBusy(true)
    try {
      await onSubmit(selected)
      onClose()
    } catch (e: any) {
      setErr(e.message ?? "move_failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background flex h-[520px] w-full max-w-md flex-col overflow-hidden rounded-lg border shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b p-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold">Move</h3>
            <div className="text-muted-foreground truncate text-xs" title={itemName}>
              {itemName}
            </div>
          </div>
          <button
            className="hover:bg-accent shrink-0 rounded p-1"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-2 text-sm">
          {err && <div className="text-destructive mb-2 px-2">{err}</div>}
          {!tree ? (
            <div className="text-muted-foreground p-4 text-sm">Loading…</div>
          ) : (
            <FolderTree
              rootId={tree.rootId}
              folders={tree.folders}
              selected={selected}
              expanded={expanded}
              forbidden={forbidden}
              currentParentId={currentParentId}
              onSelect={setSelected}
              onToggle={(id) =>
                setExpanded((prev) => {
                  const next = new Set(prev)
                  next.has(id) ? next.delete(id) : next.add(id)
                  return next
                })
              }
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!selected || selected === currentParentId || busy}
          >
            {busy ? "Moving…" : "Move"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function FolderTree({
  rootId,
  folders,
  selected,
  expanded,
  forbidden,
  currentParentId,
  onSelect,
  onToggle,
}: {
  rootId: string
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
            isForbidden
              ? "text-muted-foreground/60 cursor-not-allowed"
              : "hover:bg-accent/60 cursor-pointer"
          } ${isSelected ? "bg-accent text-accent-foreground" : ""}`}
          style={{ paddingLeft: depth * 14 + 6 }}
          onClick={() => {
            if (!isForbidden) onSelect(id)
          }}
        >
          <button
            className="shrink-0 rounded p-0.5 hover:bg-black/10"
            onClick={(e) => {
              e.stopPropagation()
              if (hasKids) onToggle(id)
            }}
          >
            {hasKids ? (
              isOpen ? (
                <CaretDownIcon size={12} />
              ) : (
                <CaretRightIcon size={12} />
              )
            ) : (
              <span className="inline-block h-3 w-3" />
            )}
          </button>
          <FolderIcon size={16} weight="fill" className="text-primary shrink-0" />
          <span className="truncate">{name}</span>
          {isCurrent && (
            <span className="text-muted-foreground ml-auto text-xs">current</span>
          )}
        </div>
        {isOpen &&
          kids.map((k) =>
            render(k.id, k.name, depth + 1)
          )}
      </div>
    )
  }

  return <div>{render(rootId, "My Drive", 0)}</div>
}
