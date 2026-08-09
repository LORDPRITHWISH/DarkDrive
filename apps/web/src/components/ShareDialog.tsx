import { useEffect, useState } from "react"
import { CopyIcon, TrashIcon } from "@phosphor-icons/react"
import { apiGet, apiJson } from "@/lib/api"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl gap-0 p-0">
        <DialogHeader className="border-b p-4">
          <div className="text-sm text-muted-foreground">Share</div>
          <DialogTitle className="truncate">{resourceName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              <div className="text-muted-foreground mb-1 text-xs">Permission</div>
              <Select
                items={{ VIEW: "View", EDIT: "Edit (download)" }}
                value={permission}
                onValueChange={(v) => setPermission(v as "VIEW" | "EDIT")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIEW">View</SelectItem>
                  <SelectItem value="EDIT">Edit (download)</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="text-sm">
              <div className="text-muted-foreground mb-1 text-xs">Expires</div>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </label>
          </div>
          <label className="text-sm block">
            <div className="text-muted-foreground mb-1 text-xs">Password (optional)</div>
            <Input
              type="password"
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
                    <Input readOnly value={url} className="flex-1 font-mono text-xs" />
                    <span className="text-muted-foreground text-xs">{s.permission}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => navigator.clipboard.writeText(url)}
                      title="Copy"
                    >
                      <CopyIcon size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => deleteShare(s.id)}
                      title="Revoke"
                    >
                      <TrashIcon size={16} />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
