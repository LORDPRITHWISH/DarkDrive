import { useEffect, useState } from "react"
import { GlobeIcon, MagnifyingGlassIcon, DoorOpenIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
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
    if (open) setQ("")
  }, [open])

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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[80vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="flex items-center gap-1.5">
            <GlobeIcon size={18} weight="fill" className="text-primary" />
            Join a space
          </DialogTitle>
          <DialogDescription>
            Browse public spaces anyone can join.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b p-3">
          <div className="relative">
            <MagnifyingGlassIcon
              size={14}
              className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
            />
            <Input
              autoFocus
              className="pl-8"
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
      </DialogContent>
    </Dialog>
  )
}
