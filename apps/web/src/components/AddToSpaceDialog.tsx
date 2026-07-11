import { useEffect, useState } from "react"
import { UsersThreeIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { useDrive } from "@/store/drive"

type Props = {
  open: boolean
  items: { type: "folder" | "file"; id: string }[]
  displayName: string
  onClose: () => void
}

export function AddToSpaceDialog({
  open,
  items,
  displayName,
  onClose,
}: Props) {
  const spaces = useDrive((s) => s.spaces)
  const loadSpaces = useDrive((s) => s.loadSpaces)
  const addFileToSpace = useDrive((s) => s.addFileToSpace)
  const addFolderToSpace = useDrive((s) => s.addFolderToSpace)
  const addItemsToSpace = useDrive((s) => s.addItemsToSpace)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setBusy(null)
    setErr(null)
    void loadSpaces()
  }, [open, loadSpaces])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [open, onClose])

  if (!open) return null

  async function add(rootFolderId: string) {
    setBusy(rootFolderId)
    setErr(null)
    try {
      if (items.length === 1) {
        const [only] = items
        if (only.type === "file") await addFileToSpace(only.id, rootFolderId)
        else await addFolderToSpace(only.id, rootFolderId)
      } else {
        await addItemsToSpace(items, rootFolderId)
      }
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-lg border shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b p-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold">Add to space</h3>
            <div className="text-muted-foreground truncate text-xs" title={displayName}>
              {displayName}
            </div>
            <div className="text-muted-foreground mt-1 text-xs">
              The original stays in your drive. A link will appear in the space.
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

        <div className="flex-1 overflow-auto p-2">
          {err && <div className="text-destructive p-2 text-xs">{err}</div>}
          {spaces.length === 0 ? (
            <div className="text-muted-foreground p-6 text-center text-sm">
              You're not in any spaces yet. Create one from the sidebar first.
            </div>
          ) : (
            <ul className="flex flex-col">
              {spaces.map((s) => (
                <li key={s.id}>
                  <button
                    disabled={busy !== null}
                    onClick={() => void add(s.rootFolderId)}
                    className="hover:bg-accent/60 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm disabled:opacity-60"
                  >
                    <UsersThreeIcon size={18} className="text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {s.members.length} member{s.members.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    {busy === s.rootFolderId && (
                      <span className="text-muted-foreground text-xs">Adding…</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t p-3">
          <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
