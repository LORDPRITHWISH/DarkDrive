import { useCallback, useEffect, useState } from "react"
import { ImageSquareIcon, CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Progress } from "@workspace/ui/components/progress"
import { apiGet, apiJson } from "@/lib/api"
import { LogList, useLogs } from "./LogsPanel"

type ThumbStatus = {
  tools: Array<{ kind: string; cmd: string; ok: boolean }>
  missing: number
  states: Array<{ state: string; count: number }>
  progress: {
    running: boolean
    total: number
    done: number
    ok: number
    failed: number
    startedAt: number | null
    finishedAt: number | null
  }
}

export function ThumbnailsPanel() {
  const [status, setStatus] = useState<ThumbStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const { entries } = useLogs("[thumb]")

  const load = useCallback(async () => {
    try {
      setStatus(await apiGet<ThumbStatus>("/api/admin/thumbnails"))
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "failed")
    }
  }, [])

  // Poll fast while a backfill is running so the progress line actually moves.
  const running = status?.progress.running ?? false
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), running ? 2000 : 10000)
    return () => clearInterval(t)
  }, [load, running])

  async function rebuild() {
    setBusy(true)
    setMsg(null)
    try {
      await apiJson<{ ok: boolean }>("/api/admin/thumbnails/rebuild", "POST", {
        includeFailed: true,
      })
      await load()
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "failed")
    } finally {
      setBusy(false)
    }
  }

  const missingTools = status?.tools.filter((t) => !t.ok) ?? []
  const p = status?.progress

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ImageSquareIcon size={16} />
            Thumbnails
          </CardTitle>
          <Button size="sm" onClick={() => void rebuild()} disabled={busy || running}>
            {running ? "Generating…" : busy ? "Starting…" : "Generate missing thumbnails"}
          </Button>
        </div>
        <CardDescription>
          {msg ??
            (status
              ? `${status.missing.toLocaleString()} file${status.missing === 1 ? "" : "s"} without a thumbnail`
              : "Loading…")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {p && p.startedAt && (
          <div className="flex flex-col gap-1">
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>
                {p.running ? "Running" : "Last run"} · {p.done.toLocaleString()} /{" "}
                {p.total.toLocaleString()} processed
              </span>
              <span>
                {p.ok.toLocaleString()} generated · {p.failed.toLocaleString()} failed
              </span>
            </div>
            <Progress value={p.total > 0 ? Math.min(100, (p.done / p.total) * 100) : 0} />
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {status?.tools.map((t) => (
            <Badge key={t.cmd} variant={t.ok ? "secondary" : "destructive"} title={t.kind}>
              {t.ok ? <CheckCircleIcon size={12} /> : <XCircleIcon size={12} />}
              {t.cmd}
            </Badge>
          ))}
          {status?.states.map((s) => (
            <Badge key={s.state} variant="outline">
              {s.state}: {s.count.toLocaleString()}
            </Badge>
          ))}
        </div>

        {missingTools.length > 0 && (
          <p className="text-destructive text-xs">
            Not installed on the server: {missingTools.map((t) => t.cmd).join(", ")} — those file
            types can never be thumbnailed until the binaries are present (imagemagick, ffmpeg,
            poppler-utils, libreoffice).
          </p>
        )}

        <LogList entries={entries} />
      </CardContent>
    </Card>
  )
}
