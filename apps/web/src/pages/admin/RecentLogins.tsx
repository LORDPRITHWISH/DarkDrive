import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card"
import { Avatar, AvatarImage, AvatarFallback } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { formatDate } from "@/lib/format"
import type { AdminStats } from "@/lib/types"

function shortAgent(ua: string | null): string {
  if (!ua) return "unknown"
  if (/iPhone|iPad|iOS/.test(ua)) return "iOS"
  if (/Android/.test(ua)) return "Android"
  if (/Mac OS X/.test(ua)) return "macOS"
  if (/Windows/.test(ua)) return "Windows"
  if (/Linux/.test(ua)) return "Linux"
  return ua.slice(0, 30)
}

export function RecentLogins({ stats }: { stats: AdminStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent logins</CardTitle>
      </CardHeader>
      <CardContent className="gap-0">
        {stats.logins.recent.length === 0 ? (
          <div className="text-muted-foreground py-6 text-center text-xs">
            No logins recorded yet.
          </div>
        ) : (
          <ul className="divide-y">
            {stats.logins.recent.map((l) => (
              <li key={l.id} className="flex items-center gap-2 py-1.5 text-sm">
                <Avatar className="h-5 w-5">
                  {l.user.avatarUrl && <AvatarImage src={l.user.avatarUrl} alt="" />}
                  <AvatarFallback>{l.user.name[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                </Avatar>
                <span className="truncate">{l.user.name}</span>
                <Badge variant="outline" className="font-mono">
                  {l.ip ?? "–"}
                </Badge>
                <Badge variant="muted">{shortAgent(l.userAgent)}</Badge>
                <span className="text-muted-foreground ml-auto text-xs">
                  {formatDate(l.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
