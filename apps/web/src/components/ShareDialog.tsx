import { useEffect, useState } from "react"
import { XIcon, CopyIcon, TrashIcon } from "@phosphor-icons/react"
import { apiGet, apiJson } from "@/lib/api"
import { Button } from "@workspace/ui/components/button"
import type { Share } from "@/lib/types"

type Props = {
  open: boolean
  onClose: () => void
  resourceType: "FILE" | "FOLDER"
  resourceId: string
  resourceName: string
}

export function ShareDialog({ open, onClose, resourceType, resourceId, resourceName }: Props) {
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

  if (!open) return null

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
    } finally {
      setLoading(false)
    }
  }

  async function deleteShare(id: string) {
    await apiJson(`/api/shares/${id}`, "DELETE")
    await load()
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card text-card-foreground w-full max-w-xl rounded-lg border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <div className="text-sm text-muted-foreground">Share</div>
            <div className="truncate font-medium">{resourceName}</div>
          </div>
          <button onClick={onClose} className="hover:bg-accent rounded-md p-1">
            <XIcon size={18} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              <div className="text-muted-foreground mb-1 text-xs">Permission</div>
              <select
                className="bg-background w-full rounded-md border px-2 py-1.5 text-sm"
                value={permission}
                onChange={(e) => setPermission(e.target.value as "VIEW" | "EDIT")}
              >
                <option value="VIEW">View</option>
                <option value="EDIT">Edit (download)</option>
              </select>
            </label>
            <label className="text-sm">
              <div className="text-muted-foreground mb-1 text-xs">Expires</div>
              <input
                type="datetime-local"
                className="bg-background w-full rounded-md border px-2 py-1.5 text-sm"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </label>
          </div>
          <label className="text-sm block">
            <div className="text-muted-foreground mb-1 text-xs">Password (optional)</div>
            <input
              type="password"
              className="bg-background w-full rounded-md border px-2 py-1.5 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <Button onClick={createLink} disabled={loading}>
            Create link
          </Button>
        </div>

        <div className="border-t p-4">
          <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">
            Active links
          </div>
          {shares.length === 0 ? (
            <div className="text-muted-foreground text-sm">No active links.</div>
          ) : (
            <ul className="space-y-2">
              {shares.map((s) => {
                const url = `${window.location.origin}/s/${s.token}`
                return (
                  <li
                    key={s.id}
                    className="bg-accent/40 flex items-center gap-2 rounded-md p-2"
                  >
                    <input
                      readOnly
                      value={url}
                      className="bg-background flex-1 rounded border px-2 py-1 font-mono text-xs"
                    />
                    <span className="text-muted-foreground text-xs">{s.permission}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(url)}
                      className="hover:bg-accent rounded p-1"
                      title="Copy"
                    >
                      <CopyIcon size={16} />
                    </button>
                    <button
                      onClick={() => deleteShare(s.id)}
                      className="hover:bg-destructive/20 rounded p-1"
                      title="Revoke"
                    >
                      <TrashIcon size={16} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
