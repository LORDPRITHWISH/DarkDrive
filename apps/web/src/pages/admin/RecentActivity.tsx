import {
  DownloadSimpleIcon,
  EyeIcon,
  FileIcon,
} from "@phosphor-icons/react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card"
import { Avatar, AvatarImage, AvatarFallback } from "@workspace/ui/components/avatar"
import { formatDate, relativeTime } from "@/lib/format"
import { iconFor } from "@/lib/fileIcon"
import type { AdminStats } from "@/lib/types"

function actionMeta(action: string) {
  if (action === "download")
    return {
      Icon: DownloadSimpleIcon,
      tint: "bg-sky-500/10 text-sky-500",
      label: "downloaded",
    }
  if (action === "view")
    return {
      Icon: EyeIcon,
      tint: "bg-emerald-500/10 text-emerald-500",
      label: "viewed",
    }
  return {
    Icon: FileIcon,
    tint: "bg-muted text-muted-foreground",
    label: action,
  }
}

// Group events into time buckets the way Google-style feeds do, so you can
// skim the "what just happened" vs. "older today" at a glance.
function bucket(iso: string): { key: string; label: string; order: number } {
  const then = new Date(iso)
  const now = new Date()
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const hours = (now.getTime() - then.getTime()) / 3600000
  if (hours < 1) return { key: "last-hour", label: "Last hour", order: 0 }
  if (then.getTime() >= day0.getTime())
    return { key: "today", label: "Earlier today", order: 1 }
  const y = new Date(day0)
  y.setDate(y.getDate() - 1)
  if (then.getTime() >= y.getTime())
    return { key: "yesterday", label: "Yesterday", order: 2 }
  return { key: "older", label: "Older", order: 3 }
}

export function RecentActivity({ stats }: { stats: AdminStats }) {
  const groups = new Map<
    string,
    {
      label: string
      order: number
      items: AdminStats["activity"]["recent"]
    }
  >()
  for (const a of stats.activity.recent) {
    const b = bucket(a.accessedAt)
    if (!groups.has(b.key))
      groups.set(b.key, { label: b.label, order: b.order, items: [] })
    groups.get(b.key)!.items.push(a)
  }
  const sections = Array.from(groups.values()).sort((a, b) => a.order - b.order)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent file activity</CardTitle>
      </CardHeader>
      <CardContent className="gap-4">
        {stats.activity.recent.length === 0 ? (
          <div className="text-muted-foreground py-6 text-center text-xs">
            No access events yet.
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.label}>
              <div className="text-muted-foreground mb-2 text-[10px] font-semibold uppercase tracking-wider">
                {section.label}
              </div>
              <ul className="flex flex-col gap-2">
                {section.items.map((a) => {
                  const meta = actionMeta(a.action)
                  const Icon = meta.Icon
                  return (
                    <li
                      key={a.id}
                      className="hover:bg-accent/30 -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5"
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        {a.user.avatarUrl && (
                          <AvatarImage src={a.user.avatarUrl} alt="" />
                        )}
                        <AvatarFallback>
                          {a.user.name[0]?.toUpperCase() ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={`${meta.tint} grid h-6 w-6 shrink-0 place-items-center rounded-full`}
                      >
                        <Icon size={12} weight="fill" />
                      </div>
                      <div className="min-w-0 flex-1 text-sm">
                        <span className="font-medium">{a.user.name}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          {meta.label}{" "}
                        </span>
                        <span className="inline-flex items-center gap-1 align-middle">
                          {iconFor(a.mimeType, 14, a.fileName)}
                          <span className="truncate">{a.fileName}</span>
                        </span>
                      </div>
                      <span
                        className="text-muted-foreground shrink-0 text-xs tabular-nums"
                        title={formatDate(a.accessedAt)}
                      >
                        {relativeTime(a.accessedAt)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  )
}
