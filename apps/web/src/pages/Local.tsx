import { useCallback, useEffect, useState } from "react"
import { Navigate, useNavigate, useSearchParams } from "react-router-dom"
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  CaretRightIcon,
  CloudCheckIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from "@phosphor-icons/react"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { desktop, type LocalEntry, type LocalListing } from "@/lib/desktop"
import { formatBytes, formatDate } from "@/lib/format"
import { useAuth } from "@/store/auth"
import { toast } from "@/store/toast"

const run = (fn: () => Promise<unknown>) =>
  void fn().catch((e: Error) => toast.error(e.message))

// This computer's own files, in the desktop app: look around, open things,
// see what's already in DarkDrive and start syncing what isn't. The folder
// being shown is ?dir=, so back and forward walk the folders visited. The
// desktop app does the looking (apps/desktop local.ts); this only shows it.
export function LocalPage() {
  const [params, setParams] = useSearchParams()
  const dir = params.get("dir") ?? undefined
  const [listing, setListing] = useState<LocalListing | null>(null)
  const temp = useAuth((s) => !!s.user?.tempSessionExpiresAt)
  const nav = useNavigate()

  const load = useCallback(() => {
    desktop
      ?.listLocal(dir)
      .then(setListing)
      .catch((e: Error) => toast.error(e.message))
  }, [dir])
  useEffect(load, [load])

  // Someone else's temporary login has no business in this computer's files.
  if (!desktop || temp) return <Navigate to="/home" replace />
  const d = desktop
  const go = (to: string) => setParams({ dir: to })

  const actions = (e: LocalEntry) => (
    <>
      {!e.dir && (
        <Button size="icon-sm" variant="ghost" title="Open" onClick={() => run(() => d.openLocal(e.path))}>
          <ArrowSquareOutIcon size={14} />
        </Button>
      )}
      {e.route ? (
        <Button size="icon-sm" variant="ghost" title="Open in DarkDrive" onClick={() => nav(e.route!)}>
          <CloudCheckIcon size={14} />
        </Button>
      ) : (
        e.dir && (
          <Button
            size="icon-sm"
            variant="ghost"
            title="Sync with DarkDrive"
            onClick={() =>
              run(async () => {
                // The desktop app asks before it starts; false is "no".
                if (!(await d.syncLocal(e.path))) return
                toast.success(`Syncing "${e.name}" with DarkDrive`)
                load()
              })
            }
          >
            <ArrowsClockwiseIcon size={14} />
          </Button>
        )
      )}
      <Button size="icon-sm" variant="ghost" title="Show in file manager" onClick={() => run(() => d.showLocal(e.path))}>
        <FolderOpenIcon size={14} />
      </Button>
    </>
  )

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <SidebarToggle />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Local files</div>
            <nav aria-label="Folder path" className="text-muted-foreground flex flex-wrap items-center text-xs">
              {listing?.parents.map((p, i) => (
                <span key={p.dir} className="flex items-center">
                  {i > 0 && <CaretRightIcon size={10} className="mx-0.5 shrink-0" />}
                  <button className="hover:text-foreground max-w-40 truncate" onClick={() => go(p.dir)}>
                    {p.name}
                  </button>
                </span>
              ))}
            </nav>
          </div>
          <Button size="icon-sm" variant="ghost" title="Refresh" onClick={load}>
            <ArrowClockwiseIcon size={14} />
          </Button>
        </header>

        {listing && (
          <div className="flex flex-wrap gap-2 border-b px-4 py-2">
            {listing.places.map((p) => (
              <Button
                key={p.dir}
                size="sm"
                variant={p.dir === listing.dir ? "secondary" : "ghost"}
                title={p.dir}
                onClick={() => go(p.dir)}
              >
                {p.name}
              </Button>
            ))}
          </div>
        )}

        <ScrollArea className="min-h-0 flex-1">
          {listing && listing.entries.length === 0 && (
            <div className="text-muted-foreground p-6 text-center text-sm">Nothing in this folder.</div>
          )}
          <ul className="flex flex-col px-2 py-1">
            {listing?.entries.map((e) => (
              <li key={e.path} className="hover:bg-muted/50 flex items-center gap-2 rounded-md px-2 py-1">
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  title={e.dir ? e.path : `${e.path}\nDouble-click to open`}
                  onClick={() => e.dir && go(e.path)}
                  onDoubleClick={() => !e.dir && run(() => d.openLocal(e.path))}
                >
                  {e.dir ? (
                    <FolderIcon size={20} weight="fill" className="text-primary shrink-0" />
                  ) : (
                    <FileIcon size={20} className="text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate text-sm">{e.name}</span>
                </button>
                {e.route && <Badge variant="muted">In DarkDrive</Badge>}
                <span className="text-muted-foreground hidden w-20 shrink-0 text-right text-xs sm:block">
                  {e.dir ? "" : formatBytes(e.size)}
                </span>
                <span className="text-muted-foreground hidden w-40 shrink-0 text-right text-xs md:block">
                  {formatDate(new Date(e.modified).toISOString())}
                </span>
                <div className="flex w-24 shrink-0 justify-end">{actions(e)}</div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </main>
    </div>
  )
}
