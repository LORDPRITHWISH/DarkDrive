import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card"
import { Avatar, AvatarImage, AvatarFallback } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { formatDate } from "@/lib/format"
import { iconFor } from "@/lib/fileIcon"
import type { AdminStats } from "@/lib/types"

export function RecentActivity({ stats }: { stats: AdminStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent file activity</CardTitle>
      </CardHeader>
      <CardContent className="gap-0">
        {stats.activity.recent.length === 0 ? (
          <div className="text-muted-foreground py-6 text-center text-xs">
            No access events yet.
          </div>
        ) : (
          <ul className="divide-y">
            {stats.activity.recent.map((a) => (
              <li key={a.id} className="flex items-center gap-2 py-1.5 text-sm">
                <Avatar className="h-5 w-5">
                  {a.user.avatarUrl && <AvatarImage src={a.user.avatarUrl} alt="" />}
                  <AvatarFallback>{a.user.name[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                </Avatar>
                <span className="truncate">{a.user.name}</span>
                <Badge variant="muted" className="capitalize">
                  {a.action}
                </Badge>
                {iconFor(a.mimeType, 14)}
                <span className="truncate flex-1">{a.fileName}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatDate(a.accessedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
