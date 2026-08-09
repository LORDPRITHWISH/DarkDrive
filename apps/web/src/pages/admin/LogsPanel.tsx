import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowClockwiseIcon, TerminalWindowIcon } from "@phosphor-icons/react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { apiGet } from "@/lib/api"

export type LogEntry = { t: number; level: "log" | "warn" | "error"; msg: string }

const LEVEL_CLASS: Record<LogEntry["level"], string> = {
  log: "text-muted-foreground",
  warn: "text-amber-500",
  error: "text-destructive",
}

// Polls the API's in-memory log ring. `q` is a server-side substring filter.
export function useLogs(q: string, pollMs = 5000) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{ entries: LogEntry[] }>(
        `/api/admin/logs?limit=300&q=${encodeURIComponent(q)}`
      )
      setEntries(r.entries)
      setErr(null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed")
    }
  }, [q])

  useEffect(() => {
    void load()
    if (!pollMs) return
    const t = setInterval(() => void load(), pollMs)
    return () => clearInterval(t)
  }, [load, pollMs])

  return { entries, err, reload: load }
}

// Scrollable, monospace log view. Sticks to the bottom unless the user has
// scrolled up to read something.
export function LogList({ entries }: { entries: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    const el = ref.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [entries])

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}
      className="bg-muted/40 h-72 overflow-auto rounded-md border p-2 font-mono text-[11px] leading-relaxed"
    >
      {entries.length === 0 ? (
        <div className="text-muted-foreground p-2">No log lines yet.</div>
      ) : (
        entries.map((e, i) => (
          <div key={`${e.t}-${i}`} className="flex gap-2 whitespace-pre-wrap break-all">
            <span className="text-muted-foreground/70 shrink-0">
              {new Date(e.t).toLocaleTimeString()}
            </span>
            <span className={LEVEL_CLASS[e.level]}>{e.msg}</span>
          </div>
        ))
      )}
    </div>
  )
}

export function LogsPanel() {
  const [q, setQ] = useState("")
  const { entries, err, reload } = useLogs(q)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <TerminalWindowIcon size={16} />
            Server logs
          </CardTitle>
          <div className="flex items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter…"
              className="h-8 w-40"
            />
            <Button size="sm" variant="outline" onClick={() => void reload()}>
              <ArrowClockwiseIcon size={14} />
            </Button>
          </div>
        </div>
        <CardDescription>
          {err ? (
            <span className="text-destructive">{err}</span>
          ) : (
            `Last ${entries.length} line${entries.length === 1 ? "" : "s"} from this process · refreshes every 5s`
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LogList entries={entries} />
      </CardContent>
    </Card>
  )
}
