import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Navigate } from "react-router-dom"
import {
  ArrowsClockwiseIcon,
  FolderIcon,
  FolderOpenIcon,
  PauseIcon,
  PlayIcon,
  TerminalWindowIcon,
  XIcon,
} from "@phosphor-icons/react"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { PopConfirm } from "@workspace/ui/components/popconfirm"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { desktop, type DesktopState } from "@/lib/desktop"
import { toast } from "@/store/toast"

const run = (fn: () => Promise<unknown>) =>
  void fn().catch((e: Error) => toast.error(e.message))

// What this computer keeps in sync: the desktop app's own page, linked from
// the sidebar only there. Each folder here pairs a folder on disk with one in
// "Synced Folders", which is where the web shows them.
export function SyncPage() {
  const [state, setState] = useState<DesktopState | null>(null)
  const [available, setAvailable] = useState<{ id: string; name: string }[] | null>(null)

  useEffect(() => {
    if (!desktop) return
    const load = () => void desktop!.getState().then(setState)
    load()
    return desktop.onChange(load)
  }, [])

  if (!desktop) return <Navigate to="/home" replace />
  const d = desktop

  async function pickRemote() {
    const list = await d.availableFolders()
    if (!list.length)
      return void toast.info("Every folder in Synced Folders is already on this computer.")
    setAvailable(list)
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarToggle />
            <div className="min-w-0">
              <div className="text-sm font-semibold">This computer</div>
              <div className="text-muted-foreground truncate text-xs">
                {state && `${state.device} · ${new URL(state.apiUrl).host} · v${state.version}`}
              </div>
            </div>
          </div>
          {state && state.folders.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant={state.syncing ? "default" : "muted"}>
                {state.syncing ? "Syncing" : "Paused"}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => run(() => d.setSyncing(!state.syncing))}>
                {state.syncing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                {state.syncing ? "Pause" : "Resume"}
              </Button>
            </div>
          )}
        </header>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            {state?.updateReady && (
              <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border p-4">
                <span className="flex-1 text-sm">
                  DarkDrive {state.updateReady} is ready to install.
                </span>
                <Button size="sm" onClick={() => run(() => d.installUpdate())}>
                  Restart to update
                </Button>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowsClockwiseIcon size={16} weight="bold" />
                  Synced folders
                </CardTitle>
                <CardDescription>
                  Kept the same here and in Synced Folders. Only these are on this
                  computer, never the rest of your drive.
                </CardDescription>
              </CardHeader>
              <CardContent className="gap-3">
                {state?.folders.length ? (
                  <ul className="flex flex-col">
                    {state.folders.map((f) => (
                      <li key={f.id} className="flex items-center gap-2 border-b py-2 last:border-b-0">
                        <FolderIcon size={20} weight="fill" className="text-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{f.name}</div>
                          <div className="text-muted-foreground truncate text-xs" title={f.dir}>
                            {f.dir}
                          </div>
                        </div>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Open folder"
                          onClick={() => run(() => d.openFolder(f.id))}
                        >
                          <FolderOpenIcon size={14} />
                        </Button>
                        <PopConfirm
                          title={`Stop syncing "${f.name}"?`}
                          description="Its files stay on this computer and on DarkDrive."
                          confirmLabel="Stop syncing"
                          onConfirm={() => run(() => d.removeFolder(f.id))}
                          trigger={
                            <Button size="icon-sm" variant="ghost" title="Stop syncing">
                              <XIcon size={14} />
                            </Button>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-muted-foreground py-2 text-xs">Nothing syncs yet.</div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => run(() => d.addLocalFolder())}>
                    Sync a folder from this computer…
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => run(pickRemote)}>
                    Keep a synced folder here…
                  </Button>
                </div>
                {available && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground basis-full text-xs">
                      Keep which one on this computer?
                    </span>
                    {available.map((r) => (
                      <Button
                        key={r.id}
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          run(async () => {
                            await d.addRemoteFolder(r.id)
                            setAvailable(null)
                          })
                        }
                      >
                        {r.name}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TerminalWindowIcon size={16} />
                  Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Log lines={state?.log ?? []} />
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </main>
    </div>
  )
}

// What the sync processes printed. Stays on the newest line unless scrolled
// up to read an older one.
function Log({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLPreElement>(null)
  const pinned = useRef(true)
  useLayoutEffect(() => {
    if (ref.current && pinned.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines])
  return (
    <pre
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget
        pinned.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
      }}
      className="bg-muted/40 text-muted-foreground h-64 overflow-auto rounded-md p-3 font-mono text-xs break-all whitespace-pre-wrap"
    >
      {lines.join("\n") || "Nothing yet."}
    </pre>
  )
}
