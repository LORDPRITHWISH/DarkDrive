import { useEffect, useState } from "react"
import { Sidebar } from "@/components/Sidebar"
import { Button } from "@workspace/ui/components/button"
import { apiGet, apiJson } from "@/lib/api"
import { formatBytes, formatDate } from "@/lib/format"
import type { AdminUser } from "@/lib/types"

const PRESETS = [
  { label: "1 GB", bytes: 1 * 1024 ** 3 },
  { label: "5 GB", bytes: 5 * 1024 ** 3 },
  { label: "15 GB", bytes: 15 * 1024 ** 3 },
  { label: "50 GB", bytes: 50 * 1024 ** 3 },
  { label: "100 GB", bytes: 100 * 1024 ** 3 },
]

export function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  async function reload() {
    try {
      const r = await apiGet<{ users: AdminUser[] }>("/api/admin/users")
      setUsers(r.users)
      setErr(null)
    } catch (e: any) {
      setErr(e.message)
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
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <div className="text-sm font-semibold">Admin</div>
        </header>
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="text-muted-foreground text-sm">Loading…</div>
          ) : err ? (
            <div className="text-destructive text-sm">{err}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-b text-xs uppercase">
                <tr>
                  <th className="py-2 pl-2 text-left font-medium">User</th>
                  <th className="py-2 text-left font-medium">Role</th>
                  <th className="py-2 text-left font-medium">Usage</th>
                  <th className="py-2 text-left font-medium">Quota</th>
                  <th className="py-2 text-left font-medium">Upgrade requested</th>
                  <th className="py-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const pct =
                    u.storageQuotaBytes > 0
                      ? Math.min(100, (u.usedBytes / u.storageQuotaBytes) * 100)
                      : 0
                  return (
                    <tr key={u.id} className="border-b align-top">
                      <td className="py-3 pl-2">
                        <div className="flex items-center gap-2">
                          {u.avatarUrl && (
                            <img src={u.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
                          )}
                          <div>
                            <div className="font-medium">{u.name}</div>
                            <div className="text-muted-foreground text-xs">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <select
                          className="bg-background rounded border px-2 py-1 text-sm"
                          value={u.role}
                          onChange={(e) =>
                            updateUser(u.id, { role: e.target.value as "USER" | "ADMIN" })
                          }
                        >
                          <option value="USER">USER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                      <td className="py-3">
                        <div className="text-xs">
                          {formatBytes(u.usedBytes)} ({pct.toFixed(0)}%)
                        </div>
                        <div className="bg-muted mt-1 h-1 w-32 overflow-hidden rounded-full">
                          <div
                            className={`h-full ${pct >= 80 ? "bg-destructive" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3">{formatBytes(u.storageQuotaBytes)}</td>
                      <td className="py-3 text-xs">
                        {u.upgradeRequestedAt ? (
                          <span className="text-primary">
                            {formatDate(u.upgradeRequestedAt)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1">
                          {PRESETS.map((p) => (
                            <Button
                              key={p.label}
                              size="sm"
                              variant={u.storageQuotaBytes === p.bytes ? "default" : "outline"}
                              onClick={() =>
                                updateUser(u.id, {
                                  storageQuotaBytes: p.bytes,
                                  clearUpgradeRequest: true,
                                })
                              }
                            >
                              {p.label}
                            </Button>
                          ))}
                          {u.upgradeRequestedAt && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateUser(u.id, { clearUpgradeRequest: true })}
                            >
                              Dismiss
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}
