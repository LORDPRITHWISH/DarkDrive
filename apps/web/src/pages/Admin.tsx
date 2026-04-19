import { useEffect, useState } from "react"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs"
import { Sidebar } from "@/components/Sidebar"
import { apiGet, apiJson } from "@/lib/api"
import { useAuth } from "@/store/auth"
import type { AdminStats, AdminUser } from "@/lib/types"
import { StatCards } from "./admin/StatCards"
import { UserGrowth } from "./admin/UserGrowth"
import { StoragePanel } from "./admin/StoragePanel"
import { FileTypesPanel } from "./admin/FileTypesPanel"
import { LargestFiles } from "./admin/LargestFiles"
import { DuplicatesList } from "./admin/DuplicatesList"
import { TrashPanel } from "./admin/TrashPanel"
import { HourlyChart } from "./admin/HourlyChart"
import { RecentActivity } from "./admin/RecentActivity"
import { RecentLogins } from "./admin/RecentLogins"
import { UsersTable } from "./admin/UsersTable"

export function AdminPage() {
  const me = useAuth((s) => s.user)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  async function reload() {
    try {
      const [s, u] = await Promise.all([
        apiGet<AdminStats>("/api/admin/stats"),
        apiGet<{ users: AdminUser[] }>("/api/admin/users"),
      ])
      setStats(s)
      setUsers(u.users)
      setErr(null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  async function updateUser(id: string, patch: Record<string, unknown>) {
    await apiJson(`/api/admin/users/${id}`, "PATCH", patch)
    await reload()
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Admin</div>
            <div className="text-muted-foreground text-xs">
              Operational dashboard
            </div>
          </div>
          {stats && (
            <div className="text-muted-foreground text-xs">
              {stats.sharing.spaces} spaces · {stats.sharing.shareLinks} share links ·{" "}
              {stats.sharing.filesInSpaces} shared files ·{" "}
              {stats.sharing.shortcuts} shortcuts
            </div>
          )}
        </header>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="text-muted-foreground text-sm">Loading…</div>
          ) : err ? (
            <div className="text-destructive text-sm">{err}</div>
          ) : stats ? (
            <Dashboard stats={stats} users={users} meId={me?.id} onUpdate={updateUser} />
          ) : null}
        </div>
      </main>
    </div>
  )
}

function Dashboard({
  stats,
  users,
  meId,
  onUpdate,
}: {
  stats: AdminStats
  users: AdminUser[]
  meId?: string
  onUpdate: (id: string, patch: Record<string, unknown>) => void | Promise<void>
}) {
  return (
    <div className="flex flex-col gap-4">
      <StatCards stats={stats} />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <UserGrowth stats={stats} />
            </div>
            <StoragePanel stats={stats} />
          </div>
          <HourlyChart stats={stats} />
          <div className="bg-muted/40 text-muted-foreground rounded-lg border p-3 text-xs">
            <strong>Note:</strong> infra metrics (CPU/RAM, disk I/O, DB latency,
            Redis cache hit ratio, API latency) live in the host environment,
            not the app DB.
          </div>
        </TabsContent>

        <TabsContent value="files" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
            <FileTypesPanel stats={stats} />
            <TrashPanel stats={stats} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LargestFiles stats={stats} />
            <DuplicatesList stats={stats} />
          </div>
        </TabsContent>

        <TabsContent
          value="activity"
          className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        >
          <RecentActivity stats={stats} />
          <RecentLogins stats={stats} />
        </TabsContent>

        <TabsContent value="users">
          <UsersTable users={users} meId={meId} onUpdate={onUpdate} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
