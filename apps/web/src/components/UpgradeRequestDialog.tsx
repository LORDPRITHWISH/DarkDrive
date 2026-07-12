import { useEffect, useState } from "react"
import { CheckCircleIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { formatBytes } from "@/lib/format"

// Slabs a user can request. Slabs at or below the current quota are filtered
// out client-side; the backend double-checks too.
export const REQUEST_SLABS: { label: string; bytes: number }[] = [
  { label: "5 GB", bytes: 5 * 1024 ** 3 },
  { label: "10 GB", bytes: 10 * 1024 ** 3 },
  { label: "15 GB", bytes: 15 * 1024 ** 3 },
  { label: "20 GB", bytes: 20 * 1024 ** 3 },
  { label: "50 GB", bytes: 50 * 1024 ** 3 },
  { label: "100 GB", bytes: 100 * 1024 ** 3 },
  { label: "500 GB", bytes: 500 * 1024 ** 3 },
]

type Props = {
  open: boolean
  currentQuotaBytes: number
  usedBytes: number
  onClose: () => void
  onSubmit: (bytes: number) => void | Promise<void>
}

export function UpgradeRequestDialog({
  open,
  currentQuotaBytes,
  usedBytes,
  onClose,
  onSubmit,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setBusy(false)
    setErr(null)
  }, [open])

  const options = REQUEST_SLABS.filter((s) => s.bytes > currentQuotaBytes)

  async function submit() {
    if (!selected || busy) return
    setBusy(true)
    setErr(null)
    try {
      await onSubmit(selected)
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request an upgrade</DialogTitle>
          <DialogDescription>
            Currently using {formatBytes(usedBytes)} of{" "}
            {formatBytes(currentQuotaBytes)}. Pick a new slab — an admin
            reviews the request before it's applied.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1">
          {options.length === 0 ? (
            <li className="text-muted-foreground py-6 text-center text-sm">
              You're already on the highest slab.
            </li>
          ) : (
            options.map((s) => {
              const chosen = selected === s.bytes
              return (
                <li key={s.label}>
                  <button
                    onClick={() => setSelected(s.bytes)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors ${
                      chosen
                        ? "border-primary bg-accent"
                        : "hover:bg-accent/50 border-transparent"
                    }`}
                  >
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatBytes(s.bytes)}
                    </span>
                    {chosen && (
                      <CheckCircleIcon
                        size={16}
                        weight="fill"
                        className="text-primary ml-2"
                      />
                    )}
                  </button>
                </li>
              )
            })
          )}
        </ul>

        {err && <div className="text-destructive mb-2 text-xs">{err}</div>}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!selected || busy}>
            {busy ? "Submitting…" : "Request upgrade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
