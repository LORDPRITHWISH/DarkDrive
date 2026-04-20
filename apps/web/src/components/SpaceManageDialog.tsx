import { useEffect, useMemo, useRef, useState } from "react"
import { TrashIcon, UserPlusIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { useDrive } from "@/store/drive"
import { useAuth } from "@/store/auth"
import { apiGet } from "@/lib/api"
import type { Space } from "@/lib/types"

type Role = "VIEWER" | "EDITOR"

type Contact = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

export function SpaceManageDialog({
  space,
  onClose,
}: {
  space: Space | null
  onClose: () => void
}) {
  const me = useAuth((s) => s.user)
  const { addMember, updateMemberRole, removeMember, deleteSpace, updateSpace } =
    useDrive()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("EDITOR")
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!space) return
    setEmail("")
    setRole("EDITOR")
    setErr(null)
    setBusy(false)
    setShowSuggestions(false)
    setHighlight(0)
  }, [space])

  // Fetch the address book once the dialog opens.
  useEffect(() => {
    if (!space) return
    let cancelled = false
    apiGet<{ contacts: Contact[] }>("/api/me/contacts")
      .then((r) => {
        if (!cancelled) setContacts(r.contacts)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [space])

  // Close suggestions on outside click.
  useEffect(() => {
    if (!showSuggestions) return
    const handler = (e: MouseEvent) => {
      if (!inputWrapRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showSuggestions])

  useEffect(() => {
    if (!space) return
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [space, onClose])

  const memberIds = useMemo(
    () => new Set(space?.members.map((m) => m.userId) ?? []),
    [space]
  )
  const suggestions = useMemo(() => {
    const q = email.trim().toLowerCase()
    return contacts
      .filter((c) => !memberIds.has(c.id))
      .filter((c) =>
        q
          ? c.email.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q)
          : true
      )
      .slice(0, 8)
  }, [contacts, memberIds, email])

  if (!space) return null

  // The creator is the implicit admin — only they can invite, remove, or
  // change roles. Other members are viewers or editors.
  const iAmOwner = space.ownerId === me?.id

  function pickContact(c: Contact) {
    setEmail(c.email)
    setShowSuggestions(false)
    setHighlight(0)
  }

  async function invite() {
    if (!email.trim() || busy || !space) return
    setBusy(true)
    setErr(null)
    try {
      await addMember(space.id, email.trim(), role)
      setEmail("")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "failed"
      setErr(
        msg === "user_not_found"
          ? "No account with that email."
          : msg === "cannot_invite_owner"
            ? "That user already owns this space."
            : msg
      )
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
            <h3 className="flex items-center gap-2 truncate text-lg font-semibold" title={space.name}>
              {space.name}
              {space.isPublic && (
                <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                  Public
                </span>
              )}
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

        {iAmOwner && (
          <label className="hover:bg-accent/40 flex cursor-pointer items-start gap-3 border-b p-4">
            <input
              type="checkbox"
              className="mt-1"
              checked={space.isPublic}
              onChange={(e) =>
                void updateSpace(space.id, { isPublic: e.target.checked })
              }
            />
            <div className="min-w-0">
              <div className="text-sm font-medium">Public space</div>
              <div className="text-muted-foreground text-xs">
                Any DarkDrive user can view the contents. Only the owner and
                explicit editors can modify.
              </div>
            </div>
          </label>
        )}

        {iAmOwner && (
          <div className="space-y-2 border-b p-4">
            <div className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Invite
            </div>
            <div className="flex items-center gap-2">
              <div ref={inputWrapRef} className="relative flex-1">
                <input
                  className="bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                  placeholder="person@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setShowSuggestions(true)
                    setHighlight(0)
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={(e) => {
                    if (showSuggestions && suggestions.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault()
                        setHighlight((h) => (h + 1) % suggestions.length)
                        return
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault()
                        setHighlight(
                          (h) => (h - 1 + suggestions.length) % suggestions.length
                        )
                        return
                      }
                      if (e.key === "Tab") {
                        const pick = suggestions[highlight]
                        if (pick) {
                          e.preventDefault()
                          pickContact(pick)
                        }
                        return
                      }
                      if (e.key === "Enter") {
                        const pick = suggestions[highlight]
                        if (pick && email.trim() !== pick.email) {
                          e.preventDefault()
                          pickContact(pick)
                          return
                        }
                      }
                      if (e.key === "Escape") {
                        setShowSuggestions(false)
                        return
                      }
                    }
                    if (e.key === "Enter") void invite()
                  }}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <ul
                    className="bg-popover absolute top-full left-0 z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border text-sm shadow-lg"
                    role="listbox"
                  >
                    {suggestions.map((c, i) => (
                      <li
                        key={c.id}
                        role="option"
                        aria-selected={i === highlight}
                        onMouseEnter={() => setHighlight(i)}
                        onMouseDown={(e) => {
                          // Prevent blur-then-click race — pick the contact on
                          // mousedown so the input doesn't lose focus first.
                          e.preventDefault()
                          pickContact(c)
                        }}
                        className={`flex cursor-pointer items-center gap-2 px-2 py-1.5 ${
                          i === highlight ? "bg-accent" : ""
                        }`}
                      >
                        {c.avatarUrl ? (
                          <img
                            src={c.avatarUrl}
                            alt=""
                            className="h-6 w-6 rounded-full"
                          />
                        ) : (
                          <div className="bg-muted grid h-6 w-6 place-items-center rounded-full text-[10px]">
                            {c.name?.[0]?.toUpperCase() ?? "?"}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">
                            {c.name}
                          </div>
                          <div className="text-muted-foreground truncate text-[11px]">
                            {c.email}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <select
                className="bg-background rounded-md border px-2 py-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="VIEWER">Viewer</option>
                <option value="EDITOR">Editor</option>
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
                        <span className="bg-primary/10 text-primary ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                          owner
                        </span>
                      )}
                      {isSelf && !isOwner && (
                        <span className="text-muted-foreground ml-2 text-xs">you</span>
                      )}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">
                      {m.email}
                    </div>
                  </div>
                  {isOwner ? (
                    <span className="text-muted-foreground text-xs">Admin</span>
                  ) : (
                    <select
                      className="bg-background rounded border px-2 py-1 text-xs disabled:opacity-60"
                      value={m.role}
                      disabled={!iAmOwner}
                      onChange={(e) =>
                        void updateMemberRole(space.id, m.userId, e.target.value as Role)
                      }
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="EDITOR">Editor</option>
                    </select>
                  )}
                  {iAmOwner && !isOwner && (
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
