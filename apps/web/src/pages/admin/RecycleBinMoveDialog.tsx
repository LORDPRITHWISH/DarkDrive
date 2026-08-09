import { useEffect, useMemo, useState } from "react"
import {
  CaretDownIcon,
  CaretRightIcon,
  FolderIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Avatar, AvatarImage, AvatarFallback } from "@workspace/ui/components/avatar"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { apiGet } from "@/lib/api"
import type { AdminFolderTree, AdminUser } from "@/lib/types"
import { HoverName } from "@/components/HoverName"

type Item = { type: "file" | "folder"; id: string; name: string }

type Props = {
  open: boolean
  item: Item | null
  users: AdminUser[]
  onClose: () => void
  onSubmit: (destFolderId: string) => void | Promise<void>
}

// Lets an admin drop a recycle-bin item into any folder in any user's drive —
// not just restore it back to where it came from.
export function RecycleBinMoveDialog({ open, item, users, onClose, onSubmit }: Props) {
  const [query, setQuery] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const [tree, setTree] = useState<AdminFolderTree | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery("")
    setUserId(null)
    setTree(null)
    setSelected(null)
    setErr(null)
    setBusy(false)
  }, [open, item?.id])

  useEffect(() => {
    if (!userId) {
      setTree(null)
      setSelected(null)
      return
    }
    setTree(null)
    setSelected(null)
    apiGet<AdminFolderTree>(`/api/admin/users/${userId}/folders/tree`)
      .then((r) => {
        setTree(r)
        setExpanded(new Set([r.rootId]))
        setSelected(r.rootId)
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load that drive."))
  }, [userId])

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )
  }, [users, query])

  if (!open || !item) return null

  async function submit() {
    if (!selected || busy) return
    setBusy(true)
    try {
      await onSubmit(selected)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't move it.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[560px] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle>Move to…</DialogTitle>
          <HoverName as="div" name={item.name} className="text-muted-foreground truncate text-xs" />
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          {/* User picker */}
          <div className="flex w-56 shrink-0 flex-col border-r">
            <div className="relative border-b p-2">
              <MagnifyingGlassIcon
                size={14}
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
              />
              <Input
                autoFocus
                className="h-auto py-1.5 pr-2 pl-7 text-xs"
                placeholder="Find a user…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-auto p-1">
              {filteredUsers.length === 0 ? (
                <div className="text-muted-foreground p-3 text-center text-xs">
                  No users match.
                </div>
              ) : (
                filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setUserId(u.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      userId === u.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                    }`}
                  >
                    <Avatar className="h-6 w-6 shrink-0">
                      {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
                      <AvatarFallback className="text-[10px]">
                        {u.name[0]?.toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Folder tree */}
          <div className="flex-1 overflow-auto p-2 text-sm">
            {err && <div className="text-destructive mb-2 px-2">{err}</div>}
            {!userId ? (
              <div className="text-muted-foreground p-4 text-center text-sm">
                Pick a user to browse their drive.
              </div>
            ) : !tree ? (
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
        </div>

        <DialogFooter className="border-t p-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!selected || busy}>
            {busy ? "Moving…" : "Move here"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  folders: AdminFolderTree["folders"]
  selected: string | null
  expanded: Set<string>
  onSelect: (id: string) => void
  onToggle: (id: string) => void
}) {
  const childrenOf = useMemo(() => {
    const m = new Map<string, AdminFolderTree["folders"]>()
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
          <HoverName as="span" name={name} className="min-w-0 truncate" />
        </div>
        {isOpen && kids.map((k) => render(k.id, k.name, depth + 1))}
      </div>
    )
  }

  return <div>{render(rootId, "Drive", 0)}</div>
}
