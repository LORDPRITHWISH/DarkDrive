import { useEffect, useMemo, useRef, useState } from "react"
import {
  TrashIcon,
  UserPlusIcon,
  GlobeIcon,
  UsersThreeIcon,
  ShieldCheckIcon,
  CheckIcon,
  XIcon,
  PencilSimpleIcon,
  LinkSimpleIcon,
  CopyIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
import { Badge } from "@workspace/ui/components/badge"
import { Avatar, AvatarImage, AvatarFallback } from "@workspace/ui/components/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { PopConfirm } from "@workspace/ui/components/popconfirm"
import { useDrive } from "@/store/drive"
import { useAuth } from "@/store/auth"
import { apiGet, apiJson } from "@/lib/api"
import type { Space, SpaceInvite } from "@/lib/types"
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

function initials(name: string) {
  return name?.[0]?.toUpperCase() ?? "?"
}

export function SpaceManageDialog({
  space: initialSpace,
  onClose,
}: {
  space: Space | null
  onClose: () => void
}) {
  const me = useAuth((s) => s.user)
  const {
    addMember,
    updateMemberRole,
    removeMember,
    deleteSpace,
    updateSpace,
    denyEditorRequest,
  } = useDrive()

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
  const [invites, setInvites] = useState<SpaceInvite[]>([])
  const [inviteExpires, setInviteExpires] = useState("")
  const [inviteMaxUses, setInviteMaxUses] = useState("")
  const [inviteBusy, setInviteBusy] = useState(false)

  const spaceId = space?.id
  const iAmOwner = space?.ownerId === me?.id
  useEffect(() => {
    if (!spaceId) return
    setEmail("")
    setRole("EDITOR")
    setErr(null)
    setBusy(false)
    setShowSuggestions(false)
    setHighlight(0)
    setInviteExpires("")
    setInviteMaxUses("")
  }, [spaceId])

  async function loadInvites() {
    if (!spaceId) return
    const data = await apiGet<{ invites: SpaceInvite[] }>(`/api/spaces/${spaceId}/invites`)
    setInvites(data.invites)
  }

  useEffect(() => {
    if (!spaceId || !iAmOwner) return
    void loadInvites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, iAmOwner])

  async function createInvite() {
    if (!spaceId || inviteBusy) return
    setInviteBusy(true)
    try {
      await apiJson(`/api/spaces/${spaceId}/invites`, "POST", {
        expiresAt: inviteExpires ? new Date(inviteExpires).toISOString() : null,
        maxUses: inviteMaxUses ? Number(inviteMaxUses) : null,
      })
      setInviteExpires("")
      setInviteMaxUses("")
      await loadInvites()
    } finally {
      setInviteBusy(false)
    }
  }

  async function revokeInvite(id: string) {
    if (!spaceId) return
    await apiJson(`/api/spaces/${spaceId}/invites/${id}`, "DELETE")
    await loadInvites()
  }

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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
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
          <div className="flex items-center gap-4 pr-8">
            <SpaceLogo
              space={space}
              size={56}
              className="ring-background shrink-0 shadow-lg ring-2"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <DialogTitle
                  className="truncate text-xl font-bold tracking-tight"
                  title={space.name}
                >
                  {space.name}
                </DialogTitle>
                {space.isPublic && (
                  <Badge className="bg-primary/15 text-primary shrink-0 gap-1 border-transparent text-[10px] font-bold uppercase tracking-wider">
                    <GlobeIcon size={10} weight="fill" />
                    Public
                  </Badge>
                )}
                {iAmOwner && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditorOpen(true)}
                    className="text-muted-foreground ml-auto"
                    title="Edit name, color, and logo"
                  >
                    <PencilSimpleIcon size={12} />
                    Edit
                  </Button>
                )}
              </div>
              <DialogDescription className="mt-1 flex items-center gap-1.5 text-xs">
                <UsersThreeIcon size={12} />
                <span>
                  {space.members.length} member
                  {space.members.length === 1 ? "" : "s"}
                </span>
                <span className="opacity-40">·</span>
                <span className="truncate">
                  Uploads count against each member's storage
                </span>
              </DialogDescription>
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
              <Switch
                checked={space.isPublic}
                onCheckedChange={(v) => void updateSpace(space.id, { isPublic: v })}
              />
            </div>
          </div>
        )}

        {iAmOwner && (
          <div className="border-b p-4">
            <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
              <LinkSimpleIcon size={12} />
              Invite link
            </div>
            <div className="text-muted-foreground mb-2 text-xs">
              Grants view-only access. People can request upload access once
              they've joined.
            </div>
            <div className="flex items-stretch gap-2">
              <Input
                type="datetime-local"
                className="w-40 rounded-xl text-sm"
                value={inviteExpires}
                onChange={(e) => setInviteExpires(e.target.value)}
                title="Expires (blank = never)"
              />
              <Input
                type="number"
                min={1}
                placeholder="No limit"
                className="w-24 rounded-xl text-sm"
                value={inviteMaxUses}
                onChange={(e) => setInviteMaxUses(e.target.value)}
                title="Max uses (blank = unlimited)"
              />
              <Button onClick={createInvite} disabled={inviteBusy} className="rounded-xl">
                {inviteBusy ? "…" : "Create"}
              </Button>
            </div>

            {invites.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {invites.map((inv) => {
                  const url = `${window.location.origin}/invite/${inv.token}`
                  const expired = inv.expiresAt && new Date(inv.expiresAt) < new Date()
                  const exhausted = inv.maxUses != null && inv.useCount >= inv.maxUses
                  const dead = expired || exhausted
                  return (
                    <li
                      key={inv.id}
                      className={`bg-accent/40 flex items-center gap-2 rounded-md p-2 ${dead ? "opacity-50" : ""}`}
                    >
                      <Input
                        readOnly
                        value={url}
                        className="h-7 flex-1 rounded font-mono text-xs"
                      />
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {[
                          inv.maxUses != null && `${inv.useCount}/${inv.maxUses} used`,
                          inv.expiresAt &&
                            (expired
                              ? "expired"
                              : `expires ${new Date(inv.expiresAt).toLocaleDateString()}`),
                        ]
                          .filter(Boolean)
                          .join(" · ") || "no limits"}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => navigator.clipboard.writeText(url)}
                        title="Copy"
                        aria-label="Copy invite link"
                      >
                        <CopyIcon size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => void revokeInvite(inv.id)}
                        title="Revoke"
                        aria-label="Revoke invite link"
                      >
                        <TrashIcon size={14} />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
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
                <Input
                  className="w-full rounded-xl"
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
                        <Avatar className="ring-background h-7 w-7 ring-2">
                          {c.avatarUrl && <AvatarImage src={c.avatarUrl} alt="" />}
                          <AvatarFallback className="text-[11px] font-semibold">
                            {initials(c.name)}
                          </AvatarFallback>
                        </Avatar>
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
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                  <SelectItem value="EDITOR">Editor</SelectItem>
                </SelectContent>
              </Select>
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
                  <Avatar className="ring-background h-9 w-9 ring-2">
                    {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt="" />}
                    <AvatarFallback className="text-sm font-semibold">
                      {initials(m.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="truncate text-sm font-semibold"
                        title={m.name}
                      >
                        {m.name}
                      </span>
                      {isOwner && (
                        <Badge className="bg-primary/15 text-primary shrink-0 gap-1 border-transparent text-[10px] font-bold uppercase tracking-wider">
                          <ShieldCheckIcon size={10} weight="fill" />
                          Owner
                        </Badge>
                      )}
                      {isSelf && !isOwner && (
                        <Badge variant="muted" className="shrink-0 text-[10px] font-medium">
                          you
                        </Badge>
                      )}
                      {m.editorRequestedAt && (
                        <Badge className="bg-amber-500/15 text-amber-600 shrink-0 border-transparent text-[10px] font-bold uppercase tracking-wider dark:text-amber-400">
                          Wants to upload
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">
                      {m.email}
                    </div>
                  </div>
                  {iAmOwner && m.editorRequestedAt && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void updateMemberRole(space.id, m.userId, "EDITOR")}
                        className="text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400"
                        title="Approve upload access"
                        aria-label={`Approve ${m.name}`}
                      >
                        <CheckIcon size={14} weight="bold" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void denyEditorRequest(space.id, m.userId)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Deny upload access"
                        aria-label={`Deny ${m.name}`}
                      >
                        <XIcon size={14} weight="bold" />
                      </Button>
                    </div>
                  )}
                  {isOwner ? (
                    <span className="text-muted-foreground mr-1 text-xs font-medium">
                      Admin
                    </span>
                  ) : (
                    <Select
                      value={m.role}
                      disabled={!iAmOwner}
                      onValueChange={(v) =>
                        void updateMemberRole(space.id, m.userId, v as Role)
                      }
                    >
                      <SelectTrigger size="sm" className="text-xs font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VIEWER">Viewer</SelectItem>
                        <SelectItem value="EDITOR">Editor</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {iAmOwner && !isOwner && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive opacity-0 transition-all group-hover/member:opacity-100 focus-visible:opacity-100"
                      onClick={() => void removeMember(space.id, m.userId)}
                      title="Remove"
                      aria-label={`Remove ${m.name}`}
                    >
                      <TrashIcon size={14} />
                    </Button>
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
            <PopConfirm
              title={`Delete "${space.name}"?`}
              description="All folders and files in this space will be removed. This can't be undone."
              confirmLabel="Delete"
              destructive
              onConfirm={async () => {
                await deleteSpace(space.id)
                onClose()
              }}
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                >
                  <TrashIcon size={14} weight="bold" />
                  Delete
                </Button>
              }
            />
          </div>
        )}
      </DialogContent>

      {iAmOwner && (
        <SpaceEditorDialog
          mode={editorOpen ? { kind: "edit", space } : null}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </Dialog>
  )
}
