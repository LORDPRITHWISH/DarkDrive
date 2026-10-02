import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import {
  ArrowsClockwiseIcon,
  ClockIcon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { PopConfirm } from "@workspace/ui/components/popconfirm"
import { Switch } from "@workspace/ui/components/switch"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { ComputerTabs } from "@/components/ComputerTabs"
import { desktop, type DesktopState } from "@/lib/desktop"
import { useAuth } from "@/store/auth"
import { toast } from "@/store/toast"

const run = (fn: () => Promise<unknown>) =>
  void fn().catch((e: Error) => toast.error(e.message))

const HOUR_MS = 60 * 60 * 1000
const DEFAULT_HOURS = { from: "09:00", to: "18:00" }
/** Midnight tonight. */
const tomorrow = () => new Date(new Date().setHours(24, 0, 0, 0)).getTime()

// What this computer keeps in sync: the Sync half of the desktop app's "This
// computer" (pages/Local is the other), and where its tray menu lands. Each folder here pairs a folder on disk with one in
// "Synced Folders", which is where the web shows them.
export function SyncPage() {
  const [state, setState] = useState<DesktopState | null>(null)
  const [available, setAvailable] = useState<{ id: string; name: string }[] | null>(null)
  const temp = useAuth((s) => !!s.user?.tempSessionExpiresAt)
  const nav = useNavigate()

  useEffect(() => {
    if (!desktop) return
    const load = () => void desktop!.getState().then(setState)
    load()
    return desktop.onChange(load)
  }, [])

  // A temporary login can't sync (the tray still links here).
  if (!desktop || temp) return <Navigate to="/home" replace />
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
            <ComputerTabs />
            <div className="min-w-0">
              <div className="text-sm font-semibold">This computer</div>
              <div className="text-muted-foreground truncate text-xs">
                {state && `${state.device} · ${new URL(state.apiUrl).host} · v${state.version}`}
              </div>
            </div>
          </div>
          {state && state.folders.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant={state.syncing ? "default" : "muted"}>{state.status}</Badge>
              {state.pausedUntil > Date.now() ? (
                <Button size="sm" variant="outline" onClick={() => run(() => d.pauseUntil(0))}>
                  <PlayIcon size={14} />
                  Resume
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button size="sm" variant="outline">
                        <PauseIcon size={14} />
                        Pause
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => run(() => d.pauseUntil(Date.now() + HOUR_MS))}>
                      For 1 hour
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => run(() => d.pauseUntil(tomorrow()))}>
                      Until tomorrow
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => run(() => d.pauseUntil(Infinity))}>
                      Until I resume
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
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
                          title="Browse this folder"
                          onClick={() => nav(`/local?dir=${encodeURIComponent(f.dir)}`)}
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

            {state && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClockIcon size={16} weight="bold" />
                    Sync hours
                  </CardTitle>
                  <CardDescription>
                    Only sync between these times each day. Outside them sync waits, and
                    catches up when they come round.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-row flex-wrap items-center gap-3">
                  <Switch
                    aria-label="Only sync during certain hours"
                    checked={!!state.hours}
                    onCheckedChange={(on) => run(() => d.setSyncHours(on ? DEFAULT_HOURS : null))}
                  />
                  {state.hours ? (
                    (["from", "to"] as const).map((end) => (
                      <label key={end} className="flex items-center gap-2 text-sm">
                        {end}
                        <Input
                          type="time"
                          className="w-28"
                          value={state.hours![end]}
                          // Empty while a field is being cleared to retype it.
                          onChange={(e) =>
                            e.target.value &&
                            run(() => d.setSyncHours({ ...state.hours!, [end]: e.target.value }))
                          }
                        />
                      </label>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-sm">Sync at any time</span>
                  )}
                </CardContent>
              </Card>
            )}

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
