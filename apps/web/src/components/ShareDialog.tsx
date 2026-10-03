import { useEffect, useState } from "react"
import { CopyIcon, TrashIcon, XIcon } from "@phosphor-icons/react"
import { apiGet, apiJson } from "@/lib/api"
import { WEB_ORIGIN } from "@/lib/config"
import { cn } from "@workspace/ui/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { PopConfirm } from "@workspace/ui/components/popconfirm"
import { Modal } from "@/components/Modal"
import { DateTimePicker } from "@/components/DateTimePicker"
import { CanSelects, Requests } from "@/components/MemberCan"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import type { MemberCan, MemberRequest, Share } from "@/lib/types"
import { useAuth } from "@/store/auth"
import { toast } from "@/store/toast"

type Props = {
  open: boolean
  onClose: () => void
  resourceType: "FILE" | "FOLDER"
  resourceId: string
  resourceName: string
  /** A folder's parent, where it's known: one of the user's own synced folders can be shared with people too. */
  parentId?: string | null
}

type Member = MemberCan & { id: string; name: string; email: string; avatarUrl?: string | null }

// What the API says when it won't share a folder (apps/api routes/sync.ts).
const SHARE_ERRORS: Record<string, string> = {
  user_not_found: "No DarkDrive account uses that email.",
  already_owner: "That's your own account.",
}

// The people one of the user's synced folders is shared with (apps/api
// routes/sync.ts), what each may do in it, and what those who have to ask are
// waiting on. Each keeps the folder on their own computers with the desktop
// app.
function SyncMembers({ folderId }: { folderId: string }) {
  const [members, setMembers] = useState<Member[]>([])
  const [requests, setRequests] = useState<MemberRequest[]>([])
  const [email, setEmail] = useState("")
  const [can, setCan] = useState<MemberCan>({ canUpload: "YES", canDelete: "YES" })
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const folder = `/api/sync/folders/${folderId}`
  const base = `${folder}/members`
  const load = async () => {
    const [m, r] = await Promise.all([
      apiGet<{ members: Member[] }>(base),
      apiGet<{ requests: MemberRequest[] }>(`${folder}/requests`),
    ])
    setMembers(m.members)
    setRequests(r.requests)
  }
  const failed = () => toast.error("That didn't go through. Try again.")
  // Sharing again with someone already there changes what they may do.
  const change = (m: Member, patch: Partial<MemberCan>) =>
    apiJson(base, "POST", { email: m.email, ...patch }).then(load, failed)
  const answer = (ids: string[], approve: boolean) =>
    apiJson(`${folder}/requests`, "POST", { ids, approve }).then(load, failed)

  useEffect(() => {
    void load()
  }, [folderId])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await apiJson(base, "POST", { email: email.trim(), ...can })
      setEmail("")
      await load()
    } catch (err) {
      setError(SHARE_ERRORS[(err as Error).message] ?? "Couldn't share the folder. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b p-4">
      <div className="text-sm font-semibold">Sync with people</div>
      <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
        They keep this folder on their own computers. What each may change in it is up to you:
        "Ask me first" holds what they add, or want deleted, until you agree.
      </p>
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <Input
          type="email"
          required
          placeholder="Their DarkDrive email"
          aria-label="Their DarkDrive email"
          className="min-w-0 flex-1 rounded-xl"
          aria-invalid={!!error}
          aria-describedby="sync-share-error"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError("")
          }}
        />
        <Button type="submit" disabled={busy}>
          Share
        </Button>
        <CanSelects className="basis-full" value={can} onChange={(patch) => setCan({ ...can, ...patch })} />
      </form>
      <p id="sync-share-error" role="alert" className="text-destructive mt-1.5 text-xs empty:hidden">
        {error}
      </p>
      {members.length > 0 && (
        <ul className="mt-1 flex flex-col">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 last:border-b-0 last:pb-0">
              <Avatar className="h-7 w-7 border">
                {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt="" />}
                <AvatarFallback className="text-xs font-semibold uppercase">
                  {m.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.name}</div>
                <div className="text-muted-foreground truncate text-xs">{m.email}</div>
              </div>
              <PopConfirm
                title={`Stop sharing with ${m.name}?`}
                description="Their computers keep their copies, which stop syncing."
                confirmLabel="Stop sharing"
                destructive
                onConfirm={() => apiJson(`${base}/${m.id}`, "DELETE").then(load)}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    title="Stop sharing"
                    aria-label={`Stop sharing with ${m.name}`}
                  >
                    <XIcon size={14} />
                  </Button>
                }
              />
              <CanSelects className="basis-full pl-10" value={m} onChange={(patch) => change(m, patch)} />
            </li>
          ))}
        </ul>
      )}
      {requests.length > 0 && (
        <div className="mt-4">
          <Requests requests={requests} onAnswer={answer} />
        </div>
      )}
    </div>
  )
}

export function ShareDialog({ open, onClose, resourceType, resourceId, resourceName, parentId }: Props) {
  const synced = useAuth((s) => !!s.user && !!parentId && s.user.syncRootFolderId === parentId)
  const [shares, setShares] = useState<Share[]>([])
  const [permission, setPermission] = useState<"VIEW" | "EDIT">("VIEW")
  const [password, setPassword] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [loading, setLoading] = useState(false)

  async function load() {
    const data = await apiGet<{ shares: Share[] }>(
      `/api/shares/for/${resourceType.toLowerCase()}/${resourceId}`
    )
    setShares(data.shares)
  }

  useEffect(() => {
    if (open) void load()
  }, [open, resourceId])

  async function createLink() {
    setLoading(true)
    try {
      await apiJson("/api/shares", "POST", {
        resourceType,
        resourceId,
        permission,
        password: password || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      })
      setPassword("")
      setExpiresAt("")
      await load()
    } catch {
      toast.error("Couldn't create the link.")
    } finally {
      setLoading(false)
    }
  }

  async function deleteShare(id: string) {
    await apiJson(`/api/shares/${id}`, "DELETE")
    await load()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Share"
      description={
        <span className="block truncate" title={resourceName}>
          {resourceName}
        </span>
      }
    >
      {synced && <SyncMembers folderId={resourceId} />}

      <div className="p-4">
        <div className="text-sm font-semibold">Share with a link</div>
        <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
          Anyone with the link can open it without signing in.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">
            <div className="text-muted-foreground mb-1 text-xs">Permission</div>
            <Select
              items={{ VIEW: "View", EDIT: "Edit (download)" }}
              value={permission}
              onValueChange={(v) => setPermission(v as "VIEW" | "EDIT")}
            >
              <SelectTrigger className="w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VIEW">View</SelectItem>
                <SelectItem value="EDIT">Edit (download)</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm">
            <div className="text-muted-foreground mb-1 text-xs">Expires</div>
            <DateTimePicker value={expiresAt} onChange={setExpiresAt} className="w-full" />
          </label>
          <label className="text-sm">
            <div className="text-muted-foreground mb-1 text-xs">Password</div>
            <Input
              type="password"
              placeholder="None"
              className="rounded-xl"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <Button onClick={createLink} disabled={loading} className="self-end">
            Create link
          </Button>
        </div>

        {shares.length > 0 && (
          <ul className="mt-3 space-y-2">
            {shares.map((s) => {
              const url = `${WEB_ORIGIN}/s/${s.token}`
              const expired = !!s.expiresAt && new Date(s.expiresAt) < new Date()
              return (
                <li
                  key={s.id}
                  // On a phone the link gets a row to itself, so it stays readable.
                  className={cn(
                    "bg-accent/40 flex flex-wrap items-center gap-2 rounded-md p-2",
                    expired && "opacity-50"
                  )}
                >
                  <Input
                    readOnly
                    value={url}
                    aria-label="Share link"
                    className="h-7 min-w-full flex-1 rounded font-mono text-xs sm:min-w-0"
                  />
                  <span className="text-muted-foreground flex-1 text-xs sm:flex-none">
                    {s.permission === "EDIT" ? "Edit" : "View"}
                    {s.expiresAt &&
                      (expired
                        ? ", expired"
                        : `, until ${new Date(s.expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })}`)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      navigator.clipboard.writeText(url).then(() => toast.success("Link copied."))
                    }
                    title="Copy"
                    aria-label="Copy link"
                  >
                    <CopyIcon size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => deleteShare(s.id)}
                    title="Revoke"
                    aria-label="Revoke link"
                  >
                    <TrashIcon size={14} />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}
