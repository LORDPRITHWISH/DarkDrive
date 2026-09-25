import { useCallback, useEffect, useState } from "react"
import { HardDrivesIcon, CloudArrowUpIcon } from "@phosphor-icons/react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { apiGet, apiJson } from "@/lib/api"

type StorageDriverStatus = {
  active: "local" | "s3"
  s3Configured: boolean
}

export function StorageBackendPanel() {
  const [status, setStatus] = useState<StorageDriverStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setStatus(await apiGet<StorageDriverStatus>("/api/admin/storage-driver"))
      setErr(null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function switchTo(driver: "local" | "s3") {
    if (!status || status.active === driver || busy) return
    setBusy(true)
    setErr(null)
    try {
      setStatus(
        await apiJson<StorageDriverStatus>("/api/admin/storage-driver", "POST", { driver })
      )
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Storage backend</CardTitle>
        <CardDescription>
          Where new uploads are written. Switching doesn't move existing files —
          they keep loading from wherever they already are.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={status?.active === "local" ? "default" : "outline"}
            size="sm"
            disabled={busy || !status}
            onClick={() => void switchTo("local")}
          >
            <HardDrivesIcon size={16} />
            Local disk
          </Button>
          <Button
            variant={status?.active === "s3" ? "default" : "outline"}
            size="sm"
            disabled={busy || !status || !status.s3Configured}
            onClick={() => void switchTo("s3")}
            title={
              status && !status.s3Configured
                ? "Set S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY in the API's .env first"
                : undefined
            }
          >
            <CloudArrowUpIcon size={16} />
            S3 bucket
          </Button>
        </div>
        {status && !status.s3Configured && (
          <p className="text-muted-foreground text-xs">
            S3 isn't configured on the server yet — set the S3_* variables in the API's
            .env and restart to enable it here.
          </p>
        )}
        {err && <p className="text-destructive text-xs">{err}</p>}
      </CardContent>
    </Card>
  )
}
