import { useState } from "react"
import { TelegramLogoIcon } from "@phosphor-icons/react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { LogList, useLogs } from "./LogsPanel"

// Everything the Telegram integration does is logged with a "[telegram]"
// prefix (see api lib/telegram.ts), so this is the same log ring the Server
// tab shows, pre-filtered: inbound messages and their text, link handshakes,
// download progress, and what each file landed as.
// ponytail: reads the in-memory ring, so it resets on server restart. File
// uploads are also written to ActivityLog (permanent) with their source.
export function TelegramPanel() {
  const [q, setQ] = useState("")
  const { entries, err } = useLogs("[telegram]", 3000)
  const needle = q.toLowerCase()
  const shown = needle ? entries.filter((e) => e.msg.toLowerCase().includes(needle)) : entries

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <TelegramLogoIcon size={16} weight="fill" className="text-sky-500" />
            Telegram activity
          </CardTitle>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by chat, file, user…"
            className="h-8 w-56"
          />
        </div>
        <CardDescription>
          {err ? (
            <span className="text-destructive">{err}</span>
          ) : (
            `${shown.length} event${shown.length === 1 ? "" : "s"} · messages, replies, downloads and imports · refreshes every 3s`
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LogList entries={shown} />
      </CardContent>
    </Card>
  )
}
