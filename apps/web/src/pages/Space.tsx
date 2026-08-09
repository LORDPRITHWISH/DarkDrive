import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  FilesIcon,
  FolderIcon,
  HardDrivesIcon,
  UsersThreeIcon,
  GlobeIcon,
  GearSixIcon,
  PencilSimpleIcon,
  FolderOpenIcon,
  ClockCounterClockwiseIcon,
  ShieldCheckIcon,
  DoorOpenIcon,
  SignOutIcon,
  PushPinIcon,
  PushPinSlashIcon,
  UploadSimpleIcon,
  ClockIcon,
  DotsThreeVerticalIcon,
  ArrowSquareOutIcon,
  LinkSimpleIcon,
  UserSwitchIcon,
} from "@phosphor-icons/react"
import { useAuth } from "@/store/auth"
import { useDrive } from "@/store/drive"
import { toast } from "@/store/toast"
import { confirmDialog } from "@/store/confirm"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
import { SpaceLogo } from "@/components/SpaceLogo"
import { SpaceManageDialog } from "@/components/SpaceManageDialog"
import { SpaceEditorDialog } from "@/components/SpaceEditorDialog"
import { AddToSpaceDialog } from "@/components/AddToSpaceDialog"
import { LinkFilesDialog } from "@/components/LinkFilesDialog"
import { FilePreview } from "@/components/FilePreview"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { apiGet, apiJson } from "@/lib/api"
import { apiUrl } from "@/lib/config"
import { iconFor } from "@/lib/fileIcon"
import { formatBytes, formatDate, relativeTime } from "@/lib/format"
import type { FileItem, SpaceMember, SpaceOverview } from "@/lib/types"

export function SpacePage() {
  const { id } = useParams()
  const me = useAuth((s) => s.user)
  // Read the space from the store so member/edit mutations (which call
  // loadSpaces) flow back into the dialogs live. Falls back to the overview
  // payload for public spaces the viewer hasn't joined.
  const storeSpace = useDrive((s) => s.spaces.find((sp) => sp.id === id))
  const { joinSpace, leaveSpace, togglePinSpace, requestEditorAccess } = useDrive()
  const [data, setData] = useState<SpaceOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<FileItem | null>(null)
  const [shortcutFile, setShortcutFile] = useState<FileItem | null>(null)
  const [linkFilesOpen, setLinkFilesOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      setData(await apiGet<SpaceOverview>(`/api/spaces/${id}/overview`))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "failed")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  // Keep the store's space list warm so the Manage/Edit dialogs have live data.
  useEffect(() => {
    void useDrive.getState().loadSpaces()
  }, [])

  const space = storeSpace ?? data?.space ?? null
  const isOwner = !!space && space.ownerId === me?.id
  // Admins can edit/manage any space, same override the backend grants.
  const canManage = isOwner || me?.role === "ADMIN"
  const isMember = !!data && data.space.members.some((m) => m.userId === me?.id)
  const isJoinedNonOwner = isMember && !isOwner
  const owner = data?.space.members.find((m) => m.userId === data.space.ownerId)
  const myMembership = data?.space.members.find((m) => m.userId === me?.id)
  // Same authority that already grants upload rights inside the space itself.
  const canUpload = canManage || myMembership?.role === "EDITOR"

  async function handleJoin() {
    if (!id || busy) return
    setBusy(true)
    try {
      await joinSpace(id)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleLeave() {
    if (!id || busy) return
    const ok = await confirmDialog({
      title: "Leave this space?",
      description: "You can rejoin any time since it's public.",
      confirmLabel: "Leave",
    })
    if (!ok) return
    setBusy(true)
    try {
      await leaveSpace(id)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleTogglePin() {
    if (!id || busy || !data) return
    setBusy(true)
    try {
      await togglePinSpace(id, !data.space.pinned)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleRequestEditor() {
    if (!id || busy) return
    setBusy(true)
    try {
      await requestEditorAccess(id)
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <SidebarToggle />
          <div className="truncate text-sm font-semibold">
            {data?.space.name ?? "Space"}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <HeaderActions onReload={() => void load()} />
          </div>
        </header>

        <div className="flex-1 overflow-auto px-4 py-5 md:px-6">
          {loading && (
            <div className="text-muted-foreground grid place-items-center py-20 text-sm">
              Loading…
            </div>
          )}

          {!loading && error && (
            <div className="text-muted-foreground mx-auto mt-16 max-w-md rounded-xl border border-dashed p-10 text-center text-sm">
              {error === "not_found"
                ? "This space doesn't exist."
                : error === "forbidden"
                  ? "You don't have access to this space."
                  : "Couldn't load this space."}
              <div className="mt-4">
                <Link to="/home" className="text-primary hover:underline">
                  Back to Home
                </Link>
              </div>
            </div>
          )}

          {!loading && !error && data && (
            <div className="mx-auto max-w-5xl">
              {/* Hero */}
              <section
                className="relative overflow-hidden rounded-2xl border p-5 md:p-6"
                style={
                  data.space.color
                    ? {
                        background: `linear-gradient(135deg, ${data.space.color}22, ${data.space.color}0a 45%, transparent)`,
                      }
                    : undefined
                }
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <SpaceLogo
                    space={data.space}
                    size={72}
                    className="ring-background shrink-0 shadow-lg ring-2"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1
                        className="truncate text-2xl font-bold tracking-tight"
                        title={data.space.name}
                      >
                        {data.space.name}
                      </h1>
                      {data.space.isPublic && (
                        <span className="bg-primary/15 text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                          <GlobeIcon size={10} weight="fill" />
                          Public
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      {owner && (
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheckIcon size={12} weight="fill" />
                          {isOwner ? "Owned by you" : `Owned by ${owner.name}`}
                        </span>
                      )}
                      <span className="opacity-40">·</span>
                      <span>Created {formatDate(data.space.createdAt)}</span>
                      <span className="opacity-40">·</span>
                      <span className="inline-flex items-center gap-1">
                        <ClockCounterClockwiseIcon size={12} />
                        Active {relativeTime(data.stats.lastActivityAt)}
                      </span>
                    </div>
                    <MemberStack members={data.space.members} ownerId={data.space.ownerId} />
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {!isOwner && !isMember && data.space.isPublic && (
                      <Button
                        size="sm"
                        className="rounded-lg"
                        disabled={busy}
                        onClick={() => void handleJoin()}
                      >
                        <DoorOpenIcon size={15} weight="bold" />
                        {busy ? "Joining…" : "Join"}
                      </Button>
                    )}
                    <Link to={`/drive/${data.space.rootFolderId}`}>
                      <Button size="sm" className="rounded-lg">
                        <FolderOpenIcon size={15} weight="bold" />
                        Browse files
                      </Button>
                    </Link>
                    {canUpload && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        onClick={() => setLinkFilesOpen(true)}
                        title="Link files from your drive into this space"
                      >
                        <LinkSimpleIcon size={15} weight="bold" />
                        Link files
                      </Button>
                    )}
                    {space && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        onClick={() => setManageOpen(true)}
                      >
                        <GearSixIcon size={15} />
                        Members
                      </Button>
                    )}
                    {isJoinedNonOwner && myMembership?.role === "VIEWER" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        disabled={busy || !!myMembership.editorRequestedAt}
                        onClick={() => void handleRequestEditor()}
                        title="Ask the owner for upload access"
                      >
                        {myMembership.editorRequestedAt ? (
                          <>
                            <ClockIcon size={15} />
                            Request pending
                          </>
                        ) : (
                          <>
                            <UploadSimpleIcon size={15} weight="bold" />
                            Request upload access
                          </>
                        )}
                      </Button>
                    )}
                    {isMember && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        disabled={busy}
                        onClick={() => void handleTogglePin()}
                        title={data.space.pinned ? "Unpin from sidebar" : "Pin to sidebar"}
                      >
                        {data.space.pinned ? (
                          <PushPinIcon size={15} weight="fill" />
                        ) : (
                          <PushPinSlashIcon size={15} />
                        )}
                        {data.space.pinned ? "Pinned" : "Pin"}
                      </Button>
                    )}
                    {isJoinedNonOwner && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        disabled={busy}
                        onClick={() => void handleLeave()}
                        title="Leave space"
                      >
                        <SignOutIcon size={15} />
                        Leave
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        onClick={() => setEditOpen(true)}
                        title="Edit name, color, and logo"
                      >
                        <PencilSimpleIcon size={15} />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              </section>

              {/* Stats */}
              <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatTile
                  icon={<FilesIcon size={18} weight="fill" />}
                  label="Files"
                  value={data.stats.fileCount.toLocaleString()}
                />
                <StatTile
                  icon={<FolderIcon size={18} weight="fill" />}
                  label="Folders"
                  value={data.stats.folderCount.toLocaleString()}
                />
                <StatTile
                  icon={<HardDrivesIcon size={18} weight="fill" />}
                  label="Storage"
                  value={formatBytes(data.stats.totalBytes)}
                />
                <StatTile
                  icon={<UsersThreeIcon size={18} weight="fill" />}
                  label={data.stats.memberCount === 1 ? "Member" : "Members"}
                  value={data.stats.memberCount.toLocaleString()}
                />
              </section>

              {/* Recent files */}
              <section className="mt-8">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                    Recently added
                  </div>
                  <Link
                    to={`/drive/${data.space.rootFolderId}`}
                    className="text-primary text-xs hover:underline"
                  >
                    Open space
                  </Link>
                </div>

                {data.recentFiles.length === 0 ? (
                  <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
                    Nothing here yet.{" "}
                    <Link
                      to={`/drive/${data.space.rootFolderId}`}
                      className="text-primary hover:underline"
                    >
                      Open the space
                    </Link>{" "}
                    to add files.
                  </div>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                    {data.recentFiles.map((f) => (
                      <RecentFileCard
                        key={f.id}
                        file={f}
                        me={me}
                        members={data.space.members}
                        spaceId={data.space.id}
                        onPreview={() => setPreview(f)}
                        onAddShortcut={() => setShortcutFile(f)}
                        onChanged={() => void load()}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Members */}
              <section className="mt-8">
                <div className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider">
                  Members
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                  {data.space.members.map((m) => {
                    const isSpaceOwner = m.userId === data.space.ownerId
                    return (
                      <div
                        key={m.userId}
                        className="bg-card flex items-center gap-3 rounded-lg border px-3 py-2"
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
                          <div className="truncate text-sm font-medium" title={m.name}>
                            {m.name}
                          </div>
                          <div className="text-muted-foreground truncate text-xs">
                            {m.email}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isSpaceOwner
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isSpaceOwner ? "Owner" : m.role.toLowerCase()}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>
          )}
        </div>

        <FilePreview
          file={preview}
          onClose={() => setPreview(null)}
          items={data?.recentFiles}
          onNavigate={setPreview}
        />

        <AddToSpaceDialog
          open={!!shortcutFile}
          items={shortcutFile ? [{ type: "file", id: shortcutFile.id }] : []}
          displayName={shortcutFile?.name ?? ""}
          onClose={() => setShortcutFile(null)}
        />

        {data && (
          <LinkFilesDialog
            open={linkFilesOpen}
            targetFolderId={data.space.rootFolderId}
            displayName={data.space.name}
            onClose={() => setLinkFilesOpen(false)}
            onLinked={() => void load()}
          />
        )}
      </main>

      {space && (
        <>
          <SpaceManageDialog
            space={manageOpen ? space : null}
            onClose={() => {
              setManageOpen(false)
              void load()
            }}
          />
          {canManage && (
            <SpaceEditorDialog
              mode={editOpen ? { kind: "edit", space } : null}
              onClose={() => {
                setEditOpen(false)
                void load()
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-xl border p-3">
      <div className="bg-primary/10 text-primary grid h-10 w-10 shrink-0 place-items-center rounded-lg">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-lg font-bold leading-none">{value}</div>
        <div className="text-muted-foreground mt-1 text-xs">{label}</div>
      </div>
    </div>
  )
}

function MemberStack({
  members,
  ownerId,
}: {
  members: { userId: string; name: string; avatarUrl?: string | null }[]
  ownerId: string
}) {
  // Owner first, then the rest — mirrors the roster ordering elsewhere.
  const ordered = [...members].sort((a, b) =>
    a.userId === ownerId ? -1 : b.userId === ownerId ? 1 : 0
  )
  const shown = ordered.slice(0, 6)
  const extra = ordered.length - shown.length
  return (
    <div className="mt-2 flex items-center">
      <div className="flex -space-x-2">
        {shown.map((m) =>
          m.avatarUrl ? (
            <img
              key={m.userId}
              src={m.avatarUrl}
              alt={m.name}
              title={m.name}
              className="ring-background h-7 w-7 rounded-full ring-2"
            />
          ) : (
            <div
              key={m.userId}
              title={m.name}
              className="bg-muted text-muted-foreground ring-background grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold ring-2"
            >
              {m.name?.[0]?.toUpperCase() ?? "?"}
            </div>
          )
        )}
      </div>
      {extra > 0 && (
        <span className="text-muted-foreground ml-2 text-xs">+{extra} more</span>
      )}
    </div>
  )
}

function RecentFileCard({
  file: f,
  me,
  members,
  spaceId,
  onPreview,
  onAddShortcut,
  onChanged,
}: {
  file: FileItem
  me: { id: string; role: "USER" | "ADMIN" } | null | undefined
  members: SpaceMember[]
  spaceId: string
  onPreview: () => void
  onAddShortcut: () => void
  onChanged: () => void
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const isImg = f.mimeType.startsWith("image/")
  // Only the file's own owner or a system admin can jump to its home folder
  // or reassign it — everyone else only reaches it via this space.
  const canManage = f.ownerId === me?.id || me?.role === "ADMIN"
  const uploader = members.find((m) => m.userId === f.ownerId)

  async function changeOwner(userId: string) {
    if (userId === f.ownerId || busy) return
    setBusy(true)
    try {
      await apiJson(`/api/files/${f.id}/owner`, "PATCH", { ownerId: userId, spaceId })
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change uploader.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-card hover:border-primary/60 group relative overflow-hidden rounded-lg border transition-colors">
      <button onClick={onPreview} className="block w-full text-left">
        <div className="bg-muted grid aspect-4/3 place-items-center overflow-hidden">
          {isImg ? (
            <img
              src={apiUrl(`/api/files/${f.id}/download?inline=1`)}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            iconFor(f.mimeType, 52, f.name)
          )}
        </div>
        <div className="p-2">
          <div className="truncate text-sm font-medium" title={f.name}>
            {f.name}
          </div>
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>{formatBytes(f.size)}</span>
            <span>{relativeTime(f.createdAt)}</span>
          </div>
          {uploader && (
            <div
              className="text-muted-foreground mt-0.5 truncate text-[11px]"
              title={`Uploaded by ${uploader.name}`}
            >
              by {uploader.name}
            </div>
          )}
        </div>
      </button>

      <div
        className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="bg-background/80 text-muted-foreground hover:text-foreground grid h-6 w-6 place-items-center rounded-md backdrop-blur"
                title="File actions"
              />
            }
          >
            <DotsThreeVerticalIcon size={14} weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onAddShortcut}>
              <LinkSimpleIcon size={14} />
              Add shortcut…
            </DropdownMenuItem>
            {canManage && (
              <DropdownMenuItem onClick={() => navigate(`/drive/${f.folderId}`)}>
                <ArrowSquareOutIcon size={14} />
                Go to original
              </DropdownMenuItem>
            )}
            {canManage && members.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>
                  <span className="inline-flex items-center gap-1.5">
                    <UserSwitchIcon size={12} />
                    Uploaded by
                  </span>
                </DropdownMenuLabel>
                {members.map((m) => (
                  <DropdownMenuCheckboxItem
                    key={m.userId}
                    checked={m.userId === f.ownerId}
                    onClick={() => void changeOwner(m.userId)}
                  >
                    {m.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
