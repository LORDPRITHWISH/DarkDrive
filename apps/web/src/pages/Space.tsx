import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
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
} from "@phosphor-icons/react"
import { useAuth } from "@/store/auth"
import { useDrive } from "@/store/drive"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { SpaceLogo } from "@/components/SpaceLogo"
import { SpaceManageDialog } from "@/components/SpaceManageDialog"
import { SpaceEditorDialog } from "@/components/SpaceEditorDialog"
import { FilePreview } from "@/components/FilePreview"
import { Button } from "@workspace/ui/components/button"
import { apiGet } from "@/lib/api"
import { apiUrl } from "@/lib/config"
import { iconFor } from "@/lib/fileIcon"
import { formatBytes, formatDate, relativeTime } from "@/lib/format"
import type { FileItem, SpaceOverview } from "@/lib/types"

export function SpacePage() {
  const { id } = useParams()
  const me = useAuth((s) => s.user)
  // Read the space from the store so member/edit mutations (which call
  // loadSpaces) flow back into the dialogs live. Falls back to the overview
  // payload for public spaces the viewer hasn't joined.
  const storeSpace = useDrive((s) => s.spaces.find((sp) => sp.id === id))
  const [data, setData] = useState<SpaceOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<FileItem | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

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
  const owner = data?.space.members.find((m) => m.userId === data.space.ownerId)

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <SidebarToggle />
          <div className="truncate text-sm font-semibold">
            {data?.space.name ?? "Space"}
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
                    <Link to={`/drive/${data.space.rootFolderId}`}>
                      <Button size="sm" className="rounded-lg">
                        <FolderOpenIcon size={15} weight="bold" />
                        Browse files
                      </Button>
                    </Link>
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
                    {isOwner && (
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
                    {data.recentFiles.map((f) => {
                      const isImg = f.mimeType.startsWith("image/")
                      return (
                        <button
                          key={f.id}
                          onClick={() => setPreview(f)}
                          className="bg-card hover:border-primary/60 overflow-hidden rounded-lg border text-left transition-colors"
                        >
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
                            <div
                              className="truncate text-sm font-medium"
                              title={f.name}
                            >
                              {f.name}
                            </div>
                            <div className="text-muted-foreground flex items-center justify-between text-xs">
                              <span>{formatBytes(f.size)}</span>
                              <span>{relativeTime(f.createdAt)}</span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
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
          {isOwner && (
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
