import { useEffect, useMemo, useState } from "react"
import { CaretDownIcon, CaretRightIcon, FolderIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { apiGet } from "@/lib/api"

type FolderNode = { id: string; name: string; parentId: string | null }
type TreeResponse = { rootId: string; folders: FolderNode[] }

type Props = {
  open: boolean
  initialFolderId?: string | null
  onClose: () => void
  onSubmit: (folderId: string | null) => void
}

// Lets the user scope a search to "My Drive" (any folder in their own tree)
// or clear back to searching everywhere. Deliberately separate from
// MoveDialog's tree — this one has no "forbidden" descendants logic and
// picking the root itself (folderId: null) is a valid, meaningful choice.
export function SearchFolderDialog({ open, initialFolderId, onClose, onSubmit }: Props) {
  const [tree, setTree] = useState<TreeResponse | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // Reset-on-open: mirrors MoveDialog's folder-tree fetch. The lint rule
    // wants effects to avoid synchronous setState, but there's no prop to
    // derive this from — the tree has to be (re-)fetched every time the
    // dialog opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(null)
    setErr(null)
    setTree(null)
    apiGet<TreeResponse>("/api/folders/tree/me")
      .then((r) => {
        setTree(r)
        const byId = new Map(r.folders.map((f) => [f.id, f]))
        const exp = new Set<string>()
        let cur = initialFolderId ?? null
        while (cur) {
          exp.add(cur)
          cur = byId.get(cur)?.parentId ?? null
        }
        exp.add(r.rootId)
        setExpanded(exp)
      })
      .catch((e) => setErr(e.message))
  }, [open, initialFolderId])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [open, onClose])

  if (!open) return null

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
            <h3 className="text-lg font-semibold">Search in folder</h3>
            <div className="text-muted-foreground text-xs">
              Only this folder and its subfolders will be searched
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
        </div>

        <div className="flex items-center justify-between gap-2 border-t p-3">
          <Button
            variant="ghost"
            onClick={() => {
              onSubmit(null)
              onClose()
            }}
          >
            Search everywhere
          </Button>
          <Button
            onClick={() => {
              onSubmit(selected)
              onClose()
            }}
            disabled={!selected}
          >
            Search here
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
  onSelect,
  onToggle,
}: {
  rootId: string
  folders: FolderNode[]
  selected: string | null
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
    const isSelected = selected === id

    return (
      <div key={id}>
        <div
          className={`hover:bg-accent/60 flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 ${
            isSelected ? "bg-accent text-accent-foreground" : ""
          }`}
          style={{ paddingLeft: depth * 14 + 6 }}
          onClick={() => onSelect(id)}
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
        </div>
        {isOpen && kids.map((k) => render(k.id, k.name, depth + 1))}
      </div>
    )
  }

  return <div>{render(rootId, "My Drive", 0)}</div>
}
