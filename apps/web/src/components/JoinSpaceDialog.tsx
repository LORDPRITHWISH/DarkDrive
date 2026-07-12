import { useEffect, useState } from "react"
import { XIcon, GlobeIcon, MagnifyingGlassIcon, DoorOpenIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { useDrive } from "@/store/drive"
import { SpaceLogo } from "./SpaceLogo"

// Discovery/"marketplace" modal — every public space the caller isn't already
// in (the server already excludes owned/joined ones), searchable by name,
// with a one-click Join.
export function JoinSpaceDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { publicSpaces, loadPublicSpaces, joinSpace } = useDrive()
  const [q, setQ] = useState("")
  const [joiningId, setJoiningId] = useState<string | null>(null)

  useEffect(() => {
    if (open) void loadPublicSpaces()
  }, [open, loadPublicSpaces])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [open, onClose])

  useEffect(() => {
    if (open) setQ("")
  }, [open])

  if (!open) return null

  const filtered = publicSpaces.filter((s) =>
    s.name.toLowerCase().includes(q.trim().toLowerCase())
  )

  async function handleJoin(id: string) {
    setJoiningId(id)
    try {
      await joinSpace(id)
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm duration-150"
      onClick={onClose}
    >
      <div
        className="bg-card animate-in fade-in zoom-in-95 relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b p-4">
          <div>
            <h3 className="flex items-center gap-1.5 text-lg font-bold tracking-tight">
              <GlobeIcon size={18} weight="fill" className="text-primary" />
              Join a space
            </h3>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Browse public spaces anyone can join.
            </p>
          </div>
          <button
            className="hover:bg-accent shrink-0 rounded-lg p-1.5 transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="border-b p-3">
          <div className="relative">
            <MagnifyingGlassIcon
              size={14}
              className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
            />
            <input
              autoFocus
              className="bg-background focus-visible:ring-primary/40 w-full rounded-xl border py-2 pl-8 pr-3 text-sm transition-shadow focus-visible:ring-2 focus-visible:outline-none"
              placeholder="Search public spaces…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {filtered.length === 0 ? (
            <div className="text-muted-foreground p-8 text-center text-sm">
              {publicSpaces.length === 0
                ? "No public spaces to join right now."
                : "No spaces match your search."}
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {filtered.map((s) => (
                <li
                  key={s.id}
                  className="hover:bg-accent/60 flex items-center gap-3 rounded-xl p-2 transition-colors"
                >
                  <SpaceLogo space={s} size={36} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" title={s.name}>
                      {s.name}
                    </div>
                    {s.ownerName && (
                      <div className="text-muted-foreground truncate text-xs">
                        by {s.ownerName}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-lg"
                    disabled={joiningId === s.id}
                    onClick={() => void handleJoin(s.id)}
                  >
                    <DoorOpenIcon size={14} weight="bold" />
                    {joiningId === s.id ? "…" : "Join"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
