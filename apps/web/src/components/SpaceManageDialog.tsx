import { useEffect, useMemo, useRef, useState } from "react"
import {
  TrashIcon,
  UserPlusIcon,
  XIcon,
  GlobeIcon,
  UsersThreeIcon,
  ShieldCheckIcon,
  CheckIcon,
  PencilSimpleIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { useDrive } from "@/store/drive"
import { useAuth } from "@/store/auth"
import { apiGet } from "@/lib/api"
import type { Space } from "@/lib/types"
import { SpaceLogo } from "./SpaceLogo"
import { SpaceEditorDialog } from "./SpaceEditorDialog"

type Role = "VIEWER" | "EDITOR"

type Contact = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

// Lightweight fuzzy scorer. Returns a positive score when every char of
// `query` appears in order inside `target` (subsequence match), with bonuses
// for substring hits, prefix matches, and consecutive character runs — so
// "jhn" still ranks "john" ahead of "jonathan", and exact substrings always
// win. Returns 0 when there's no match.
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim()
  const t = target.toLowerCase()
  if (!q) return 0
  if (!t) return 0
  const sub = t.indexOf(q)
  if (sub !== -1) {
    // Exact substring: huge baseline, prefix match gets extra.
    return 1000 + (sub === 0 ? 200 : 0) - sub
  }
  let qi = 0
  let score = 0
  let prev = -2
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      let pts = 2
      if (ti === prev + 1) pts += 3
      if (ti === 0) pts += 5
      score += pts
      prev = ti
      qi++
    }
  }
  return qi === q.length ? score : 0
}

function rankContact(q: string, c: Contact): number {
  if (!q) return 0
  return Math.max(fuzzyScore(q, c.name), fuzzyScore(q, c.email))
}

export function SpaceManageDialog({
  space: initialSpace,
  onClose,
}: {
  space: Space | null
  onClose: () => void
}) {
  const me = useAuth((s) => s.user)
  const { addMember, updateMemberRole, removeMember, deleteSpace, updateSpace } =
    useDrive()
  // The prop is a snapshot taken when the dialog opened. Re-read from the
  // live store so mutations (invite, role change, remove) reflect immediately
  // once `loadSpaces()` refreshes. Fall back to the snapshot if the space is
  // missing from the store (e.g. during a refresh race).
  const liveSpace = useDrive((s) =>
    initialSpace ? s.spaces.find((sp) => sp.id === initialSpace.id) : undefined
  )
  const space = liveSpace ?? initialSpace
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("EDITOR")
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [searchResults, setSearchResults] = useState<Contact[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const inputWrapRef = useRef<HTMLDivElement>(null)

  const spaceId = space?.id
  useEffect(() => {
    if (!spaceId) return
    setEmail("")
    setRole("EDITOR")
    setErr(null)
    setBusy(false)
    setShowSuggestions(false)
    setHighlight(0)
  }, [spaceId])

  useEffect(() => {
    if (!spaceId) return
    let cancelled = false
    apiGet<{ contacts: Contact[] }>("/api/me/contacts")
      .then((r) => {
        if (!cancelled) setContacts(r.contacts)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [spaceId])

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
    const q = email.trim()
    if (q.length < 2) {
      setSearchResults([])
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      apiGet<{ users: Contact[] }>(
        `/api/me/user-search?q=${encodeURIComponent(q)}`
      )
        .then((r) => {
          if (!cancelled) setSearchResults(r.users)
        })
        .catch(() => {})
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [email])

  useEffect(() => {
    if (!spaceId) return
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [spaceId, onClose])

  const memberIds = useMemo(
    () => new Set(space?.members.map((m) => m.userId) ?? []),
    [space]
  )
  const suggestions = useMemo(() => {
    const q = email.trim()
    // Merge the cached contacts with the server's directory search, deduped.
    const pool = new Map<string, Contact>()
    for (const c of contacts) pool.set(c.id, c)
    for (const c of searchResults) if (!pool.has(c.id)) pool.set(c.id, c)

    const candidates = Array.from(pool.values()).filter(
      (c) => !memberIds.has(c.id)
    )

    if (!q) {
      // Empty query: show the address book as-is (contacts first, preserving
      // their original order, then any stray server results).
      return candidates.slice(0, 8)
    }
    // Non-empty query: fuzzy-rank everything, drop non-matches, cap at 8.
    // Contacts get a small bonus so previously-collaborated folks win ties.
    const contactIds = new Set(contacts.map((c) => c.id))
    return candidates
      .map((c) => ({
        c,
        score: rankContact(q, c) + (contactIds.has(c.id) ? 5 : 0),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.c)
  }, [contacts, searchResults, memberIds, email])

  if (!space) return null

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
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm duration-150"
      onClick={onClose}
    >
      <div
        className="bg-card animate-in fade-in zoom-in-95 relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero header — space logo tints the background with the chosen color */}
        <div
          className="relative border-b p-5"
          style={
            space.color
              ? {
                  background: `linear-gradient(135deg, ${space.color}22, ${space.color}08 40%, transparent)`,
                }
              : undefined
          }
        >
          <button
            className="hover:bg-accent absolute top-3 right-3 rounded-lg p-1.5 transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon size={16} />
          </button>
          <div className="flex items-center gap-4 pr-8">
            <SpaceLogo
              space={space}
              size={56}
              className="ring-background shrink-0 shadow-lg ring-2"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3
                  className="truncate text-xl font-bold tracking-tight"
                  title={space.name}
                >
                  {space.name}
                </h3>
                {space.isPublic && (
                  <span className="bg-primary/15 text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    <GlobeIcon size={10} weight="fill" />
                    Public
                  </span>
                )}
                {iAmOwner && (
                  <button
                    onClick={() => setEditorOpen(true)}
                    className="hover:bg-accent text-muted-foreground hover:text-foreground ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors"
                    title="Edit name, color, and logo"
                  >
                    <PencilSimpleIcon size={12} />
                    Edit
                  </button>
                )}
              </div>
              <div className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                <UsersThreeIcon size={12} />
                <span>
                  {space.members.length} member
                  {space.members.length === 1 ? "" : "s"}
                </span>
                <span className="opacity-40">·</span>
                <span className="truncate">
                  Uploads count against each member's storage
                </span>
              </div>
            </div>
          </div>
        </div>

        {iAmOwner && (
          <div className="border-b p-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 text-primary grid h-10 w-10 shrink-0 place-items-center rounded-xl">
                <GlobeIcon size={18} weight="fill" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Public space</div>
                <div className="text-muted-foreground text-xs">
                  Any DarkDrive user can view. Only editors can modify.
                </div>
              </div>
              <Toggle
                checked={space.isPublic}
                onChange={(v) => void updateSpace(space.id, { isPublic: v })}
              />
            </div>
          </div>
        )}

        {iAmOwner && (
          <div className="border-b p-4">
            <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
              <UserPlusIcon size={12} />
              Add people
            </div>
            <div className="flex items-stretch gap-2">
              <div ref={inputWrapRef} className="relative flex-1">
                <input
                  className="bg-background focus-visible:ring-primary/40 w-full rounded-xl border px-3 py-2 text-sm transition-shadow focus-visible:ring-2 focus-visible:outline-none"
                  placeholder="Search by name or email…"
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
                    className="bg-popover animate-in fade-in slide-in-from-top-1 absolute top-full left-0 z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border p-1 text-sm shadow-xl duration-150"
                    role="listbox"
                  >
                    {suggestions.map((c, i) => (
                      <li
                        key={c.id}
                        role="option"
                        aria-selected={i === highlight}
                        onMouseEnter={() => setHighlight(i)}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          pickContact(c)
                        }}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
                          i === highlight ? "bg-accent" : ""
                        }`}
                      >
                        {c.avatarUrl ? (
                          <img
                            src={c.avatarUrl}
                            alt=""
                            className="h-7 w-7 rounded-full ring-2 ring-background"
                          />
                        ) : (
                          <div className="bg-muted text-muted-foreground grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold">
                            {c.name?.[0]?.toUpperCase() ?? "?"}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold">
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
                className="bg-background cursor-pointer rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-accent/40"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="VIEWER">Viewer</option>
                <option value="EDITOR">Editor</option>
              </select>
              <Button
                onClick={invite}
                disabled={!email.trim() || busy}
                className="rounded-xl"
              >
                <UserPlusIcon size={14} weight="bold" />
                {busy ? "…" : "Invite"}
              </Button>
            </div>
            {err && (
              <div className="text-destructive mt-2 text-xs font-medium">
                {err}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto p-2">
          <div className="text-muted-foreground mb-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider">
            Members
          </div>
          <ul className="flex flex-col gap-0.5">
            {space.members.map((m) => {
              const isOwner = m.userId === space.ownerId
              const isSelf = m.userId === me?.id
              return (
                <li
                  key={m.userId}
                  className="group/member hover:bg-accent/60 flex items-center gap-3 rounded-xl p-2 transition-colors"
                >
                  {m.avatarUrl ? (
                    <img
                      src={m.avatarUrl}
                      alt=""
                      className="ring-background h-9 w-9 rounded-full ring-2"
                    />
                  ) : (
                    <div className="bg-muted text-muted-foreground grid h-9 w-9 place-items-center rounded-full text-sm font-semibold">
                      {m.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="truncate text-sm font-semibold"
                        title={m.name}
                      >
                        {m.name}
                      </span>
                      {isOwner && (
                        <span className="bg-primary/15 text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                          <ShieldCheckIcon size={10} weight="fill" />
                          Owner
                        </span>
                      )}
                      {isSelf && !isOwner && (
                        <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                          you
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">
                      {m.email}
                    </div>
                  </div>
                  {isOwner ? (
                    <span className="text-muted-foreground mr-1 text-xs font-medium">
                      Admin
                    </span>
                  ) : (
                    <select
                      className="bg-background hover:bg-accent/40 cursor-pointer rounded-lg border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-60"
                      value={m.role}
                      disabled={!iAmOwner}
                      onChange={(e) =>
                        void updateMemberRole(
                          space.id,
                          m.userId,
                          e.target.value as Role
                        )
                      }
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="EDITOR">Editor</option>
                    </select>
                  )}
                  {iAmOwner && !isOwner && (
                    <button
                      className="hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg p-1.5 opacity-0 transition-all group-hover/member:opacity-100 focus-visible:opacity-100"
                      onClick={() => void removeMember(space.id, m.userId)}
                      title="Remove"
                      aria-label={`Remove ${m.name}`}
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
          <div className="bg-muted/30 flex items-center justify-between gap-2 border-t px-4 py-3">
            <div className="text-muted-foreground text-xs">
              Deleting removes all folders and files in this space.
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 rounded-lg"
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
              <TrashIcon size={14} weight="bold" />
              Delete
            </Button>
          </div>
        )}
      </div>

      {iAmOwner && (
        <SpaceEditorDialog
          mode={editorOpen ? { kind: "edit", space } : null}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`focus-visible:ring-ring relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none ${
        checked ? "bg-primary" : "bg-muted"
      }`}
    >
      <span
        className={`bg-background text-primary inline-flex h-5 w-5 transform items-center justify-center rounded-full shadow transition-transform ${
          checked ? "translate-x-5.5" : "translate-x-0.5"
        }`}
      >
        {checked && <CheckIcon size={10} weight="bold" />}
      </span>
    </button>
  )
}
