import { useCallback, useEffect, useState } from "react"
import {
  CloudIcon,
  CopyIcon,
  DeviceMobileIcon,
  FilesIcon,
  LightningIcon,
  SignInIcon,
  TelegramLogoIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
import { TelegramDialog } from "@/components/TelegramDialog"
import { StatCard } from "@/pages/admin/StatCards"
import {
  ActivitySection,
  LoginSection,
  SharingSection,
  StorageSection,
  TimelineSection,
} from "@/pages/admin/UserDetail"
import { Avatar, AvatarImage, AvatarFallback } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { PopConfirm } from "@workspace/ui/components/popconfirm"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { apiGet, apiJson } from "@/lib/api"
import { formatBytes, formatDate, relativeTime } from "@/lib/format"
import { toast } from "@/store/toast"
import type { UserDetail } from "@/lib/types"

type TelegramStatus = {
  linked: boolean
  phone: string | null
  bot: { username: string | null; linked: boolean }
}
type Device = {
  id: string
  name: string
  lastSeenAt: string | null
  createdAt: string
}

export function ProfilePage() {
  const [data, setData] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    apiGet<UserDetail>("/api/me/detail")
      .then((d) => {
        setData(d)
        setErr(null)
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "failed"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <SidebarToggle />
            <div>
              <div className="text-sm font-semibold">Profile</div>
              <div className="text-muted-foreground text-xs">Your account</div>
            </div>
          </div>
          {data && (
            <div className="text-muted-foreground hidden text-xs md:block">
              {data.storage.fileCount.toLocaleString()} files ·{" "}
              {data.sharing.spacesOwned.length + data.sharing.memberships.length} spaces ·{" "}
              {data.sharing.shareLinks} share links · {data.logins.total} logins
            </div>
          )}
          <div className="flex items-center gap-1">
            <HeaderActions onReload={load} />
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="text-muted-foreground text-sm">Loading…</div>
          ) : err ? (
            <div className="text-destructive text-sm">{err}</div>
          ) : data ? (
            <Overview data={data} />
          ) : null}
        </div>
      </main>
    </div>
  )
}

function Overview({ data }: { data: UserDetail }) {
  const u = data.user
  const s = data.storage
  const a = data.activity

  return (
    <div className="flex flex-col gap-4">
      {/* Identity — same shape as the admin user drawer's header. */}
      <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <Avatar className="h-12 w-12 shrink-0">
          {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
          <AvatarFallback className="text-base">
            {u.name[0]?.toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-lg font-semibold">{u.name}</span>
            <Badge variant={u.role === "ADMIN" ? "default" : "muted"}>{u.role}</Badge>
            {u.upgradeRequestedAt && <Badge variant="default">upgrade requested</Badge>}
          </div>
          <div className="text-muted-foreground truncate text-sm">{u.email}</div>
          <div className="text-muted-foreground mt-0.5 text-xs">
            Member since {formatDate(u.createdAt)}
            {u.upgradeRequestedBytes
              ? ` · asked for ${formatBytes(u.upgradeRequestedBytes)}`
              : ""}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CloudIcon size={16} />}
          label="Storage used"
          value={formatBytes(s.usedBytes)}
          hint={`of ${formatBytes(s.quotaBytes)} (${s.pct.toFixed(0)}%)`}
          progress={s.pct}
        />
        <StatCard
          icon={<FilesIcon size={16} />}
          label="Files"
          value={s.fileCount.toLocaleString()}
          hint={`${s.folderCount.toLocaleString()} folders · ${s.trashedCount} in trash`}
        />
        <StatCard
          icon={<LightningIcon size={16} />}
          label="Activity (7d)"
          value={(a.views7d + a.downloads7d).toLocaleString()}
          hint={`${a.views7d} views · ${a.downloads7d} downloads · ${a.total.toLocaleString()} all time`}
        />
        <StatCard
          icon={<SignInIcon size={16} />}
          label="Last sign-in"
          value={data.logins.lastLoginAt ? relativeTime(data.logins.lastLoginAt) : "—"}
          hint={
            data.logins.lastLoginAt
              ? formatDate(data.logins.lastLoginAt)
              : "No logins recorded"
          }
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="sharing">Sharing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <StorageSection data={data} />
          <ActivitySection data={data} />
        </TabsContent>

        <TabsContent value="connections">
          <Connections />
        </TabsContent>

        <TabsContent value="activity" className="flex flex-col gap-4">
          <TimelineSection data={data} />
          <LoginSection data={data} />
        </TabsContent>

        <TabsContent value="sharing">
          <SharingSection data={data} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Everything the account is wired into: Telegram (account + bot) and paired
// sync devices. The Telegram flows themselves live in <TelegramDialog>, which
// the toolbar opens too — this only summarizes and launches it.
function Connections() {
  const [tg, setTg] = useState<TelegramStatus | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [tgOpen, setTgOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    void apiGet<TelegramStatus>("/api/telegram/status").then(setTg).catch(() => setTg(null))
    void apiGet<Device[]>("/api/devices").then(setDevices).catch(() => {})
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function createDevice() {
    setBusy(true)
    try {
      const d = await apiJson<Device & { token: string }>("/api/devices", "POST", {
        name: newName.trim() || "Device",
      })
      setToken(d.token)
      setNewName("")
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the token.")
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    try {
      await apiJson(`/api/devices/${id}`, "DELETE")
      toast.success("Device revoked.")
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't revoke.")
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <TelegramLogoIcon size={16} weight="fill" className="text-sky-500" />
              Telegram
            </CardTitle>
            <div className="flex gap-1">
              {tg?.linked && <Badge variant="muted">account</Badge>}
              {tg?.bot.linked && <Badge variant="muted">bot</Badge>}
            </div>
          </div>
          <CardDescription>
            {tg?.bot.linked
              ? `Forward photos and videos to @${tg.bot.username} and they land in My Photos.`
              : "Link the bot to forward media straight into My Photos, or link your account to bulk-import Saved Messages."}
            {tg?.linked && tg.phone ? ` Account linked as ${tg.phone}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="sm" variant="outline" onClick={() => setTgOpen(true)}>
            {tg?.linked || tg?.bot.linked ? "Manage" : "Connect"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <DeviceMobileIcon size={16} weight="fill" />
              Devices
            </CardTitle>
            <span className="text-muted-foreground text-xs">{devices.length}</span>
          </div>
          <CardDescription>
            Tokens the sync client and mobile app sign in with.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-3">
          {devices.length === 0 ? (
            <div className="text-muted-foreground py-2 text-xs">No devices paired.</div>
          ) : (
            <ul className="flex flex-col">
              {devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-2 border-b py-1.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
                  <span
                    className="text-muted-foreground shrink-0 text-xs"
                    title={
                      d.lastSeenAt
                        ? formatDate(d.lastSeenAt)
                        : `Added ${formatDate(d.createdAt)}`
                    }
                  >
                    {d.lastSeenAt ? relativeTime(d.lastSeenAt) : "never used"}
                  </span>
                  <PopConfirm
                    title="Revoke this device?"
                    description="Whatever is signed in with this token stops syncing."
                    confirmLabel="Revoke"
                    onConfirm={() => revoke(d.id)}
                    trigger={
                      <Button size="icon-sm" variant="ghost" title="Revoke">
                        <TrashIcon size={14} />
                      </Button>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="New device name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void createDevice()}
              className="h-8 text-xs"
            />
            <Button size="sm" variant="outline" onClick={createDevice} disabled={busy}>
              Add
            </Button>
          </div>
          {token && (
            <div className="space-y-1 rounded-md border p-2">
              <p className="text-xs text-amber-500">Shown once — copy it now.</p>
              <div className="flex gap-2">
                <Input readOnly value={token} className="h-8 text-[11px]" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(token)
                    toast.success("Copied.")
                  }}
                >
                  <CopyIcon size={14} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <TelegramDialog
        open={tgOpen}
        onClose={() => {
          setTgOpen(false)
          load()
        }}
      />
    </div>
  )
}
