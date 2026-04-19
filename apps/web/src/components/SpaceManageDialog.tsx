import { useEffect, useState } from "react"
import { TrashIcon, UserPlusIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { useDrive } from "@/store/drive"
import { useAuth } from "@/store/auth"
import type { Space } from "@/lib/types"

type Role = "VIEWER" | "EDITOR" | "ADMIN"

export function SpaceManageDialog({
  space,
  onClose,
}: {
  space: Space | null
  onClose: () => void
}) {
  const me = useAuth((s) => s.user)
  const { addMember, updateMemberRole, removeMember, deleteSpace } = useDrive()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("EDITOR")
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!space) return
    setEmail("")
    setRole("EDITOR")
    setErr(null)
    setBusy(false)
  }, [space])

  useEffect(() => {
    if (!space) return
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [space, onClose])

  if (!space) return null

  const myMembership = space.members.find((m) => m.userId === me?.id)
  const iAmAdmin = myMembership?.role === "ADMIN"
  const iAmOwner = space.ownerId === me?.id

  async function invite() {
    if (!email.trim() || busy || !space) return
    setBusy(true)
    setErr(null)
    try {
      await addMember(space.id, email.trim(), role)
      setEmail("")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "failed"
      setErr(msg === "user_not_found" ? "No account with that email." : msg)
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
        className="bg-background flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b p-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold" title={space.name}>
              {space.name}
            </h3>
            <div className="text-muted-foreground text-xs">
              {space.members.length} member{space.members.length === 1 ? "" : "s"}
              {" · uploads count against each member's own storage"}
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

        {iAmAdmin && (
          <div className="space-y-2 border-b p-4">
            <div className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Invite
            </div>
            <div className="flex items-center gap-2">
              <input
                className="bg-background focus-visible:ring-ring flex-1 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                placeholder="person@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void invite()
                }}
              />
              <select
                className="bg-background rounded-md border px-2 py-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="VIEWER">Viewer</option>
                <option value="EDITOR">Editor</option>
                <option value="ADMIN">Admin</option>
              </select>
              <Button onClick={invite} disabled={!email.trim() || busy}>
                <UserPlusIcon size={16} />
                {busy ? "…" : "Invite"}
              </Button>
            </div>
            {err && <div className="text-destructive text-xs">{err}</div>}
          </div>
        )}

        <div className="flex-1 overflow-auto p-2">
          <ul>
            {space.members.map((m) => {
              const isOwner = m.userId === space.ownerId
              const isSelf = m.userId === me?.id
              return (
                <li
                  key={m.userId}
                  className="hover:bg-accent/40 flex items-center gap-3 rounded-md px-2 py-2"
                >
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
                  ) : (
                    <div className="bg-muted grid h-8 w-8 place-items-center rounded-full text-xs">
                      {m.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {m.name}
                      {isOwner && (
                        <span className="text-muted-foreground ml-2 text-xs">owner</span>
                      )}
                      {isSelf && !isOwner && (
                        <span className="text-muted-foreground ml-2 text-xs">you</span>
                      )}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">
                      {m.email}
                    </div>
                  </div>
                  <select
                    className="bg-background rounded border px-2 py-1 text-xs disabled:opacity-60"
                    value={m.role}
                    disabled={!iAmAdmin || isOwner}
                    onChange={(e) =>
                      void updateMemberRole(space.id, m.userId, e.target.value as Role)
                    }
                  >
                    <option value="VIEWER">Viewer</option>
                    <option value="EDITOR">Editor</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  {iAmAdmin && !isOwner && (
                    <button
                      className="hover:bg-accent text-destructive rounded p-1"
                      onClick={() => void removeMember(space.id, m.userId)}
                      title="Remove"
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        {iAmOwner && (
          <div className="flex justify-end border-t p-3">
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (
                  confirm(
                    `Delete the space "${space.name}"? All folders and files in it will be removed.`
                  )
                ) {
                  await deleteSpace(space.id)
                  onClose()
                }
              }}
            >
              <TrashIcon size={14} /> Delete space
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
