import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  GlobeIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PushPinIcon,
  PushPinSlashIcon,
  ShieldCheckIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react"
import { useAuth } from "@/store/auth"
import { useDrive } from "@/store/drive"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
import { SpaceLogo } from "@/components/SpaceLogo"
import { SpaceEditorDialog } from "@/components/SpaceEditorDialog"
import { JoinSpaceDialog } from "@/components/JoinSpaceDialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { useGridKeyNav } from "@/lib/useGridKeyNav"
import type { Space } from "@/lib/types"

export function SpacesPage() {
  const me = useAuth((s) => s.user)
  const { spaces, loadSpaces, loadPublicSpaces, togglePinSpace } = useDrive()
  const [q, setQ] = useState("")
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  useGridKeyNav(contentRef)

  function reload() {
    void loadSpaces()
    void loadPublicSpaces()
  }

  useEffect(() => {
    reload()
  }, [])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    const list = query
      ? spaces.filter((s) => s.name.toLowerCase().includes(query))
      : spaces
    // Owned first, then joined, newest first within each group.
    return [...list].sort((a, b) => {
      const aOwned = a.ownerId === me?.id ? 0 : 1
      const bOwned = b.ownerId === me?.id ? 0 : 1
      if (aOwned !== bOwned) return aOwned - bOwned
      return b.createdAt.localeCompare(a.createdAt)
    })
  }, [spaces, q, me?.id])

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <SidebarToggle />
          <div className="text-sm font-semibold">Spaces</div>
          <div className="ml-auto flex items-center gap-1">
            <HeaderActions onReload={reload} />
          </div>
        </header>

        <div ref={contentRef} className="flex-1 overflow-auto px-4 py-5 md:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Your spaces</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  Everything you own or have joined.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="relative">
                  <MagnifyingGlassIcon
                    size={14}
                    className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
                  />
                  <Input
                    className="w-44 rounded-xl pl-8 pr-3 text-sm"
                    placeholder="Search…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setJoining(true)}
                >
                  <GlobeIcon size={15} weight="fill" />
                  Join
                </Button>
                <Button size="sm" className="rounded-xl" onClick={() => setCreating(true)}>
                  <PlusIcon size={15} weight="bold" />
                  Create
                </Button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-muted-foreground mx-auto mt-10 max-w-md rounded-xl border border-dashed p-10 text-center text-sm">
                {spaces.length === 0
                  ? "You don't have any spaces yet. Create one, or join a public space to get started."
                  : "No spaces match your search."}
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                {filtered.map((s) => (
                  <SpaceCard
                    key={s.id}
                    space={s}
                    isOwner={s.ownerId === me?.id}
                    onTogglePin={(pinned) => void togglePinSpace(s.id, pinned)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <SpaceEditorDialog mode={creating ? { kind: "create" } : null} onClose={() => setCreating(false)} />
      <JoinSpaceDialog open={joining} onClose={() => setJoining(false)} />
    </div>
  )
}

function SpaceCard({
  space,
  isOwner,
  onTogglePin,
}: {
  space: Space
  isOwner: boolean
  onTogglePin: (pinned: boolean) => void
}) {
  return (
    <div className="group bg-card hover:border-primary/60 relative flex items-center gap-3 rounded-xl border p-3 transition-colors">
      <Link
        to={`/drive/${space.rootFolderId}`}
        className="focus-visible:ring-primary flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2"
      >
        <SpaceLogo space={space} size={40} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold" title={space.name}>
              {space.name}
            </span>
            {space.isPublic && (
              <GlobeIcon size={11} weight="fill" className="text-primary shrink-0" />
            )}
          </div>
          <div className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
            {isOwner ? (
              <span className="inline-flex items-center gap-1">
                <ShieldCheckIcon size={11} weight="fill" />
                Owner
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <UsersThreeIcon size={11} />
                {space.members.length} member{space.members.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
      </Link>
      <button
        onClick={() => onTogglePin(!space.pinned)}
        title={space.pinned ? "Unpin from sidebar" : "Pin to sidebar"}
        aria-label={space.pinned ? "Unpin from sidebar" : "Pin to sidebar"}
        className={`shrink-0 rounded-lg p-1.5 transition-colors ${
          space.pinned
            ? "text-primary"
            : "text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
        }`}
      >
        {space.pinned ? (
          <PushPinIcon size={15} weight="fill" />
        ) : (
          <PushPinSlashIcon size={15} />
        )}
      </button>
    </div>
  )
}
