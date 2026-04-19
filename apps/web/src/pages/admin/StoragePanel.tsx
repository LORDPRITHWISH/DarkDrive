import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card"
import { Avatar, AvatarImage, AvatarFallback } from "@workspace/ui/components/avatar"
import { Progress } from "@workspace/ui/components/progress"
import { formatBytes } from "@/lib/format"
import type { AdminStats } from "@/lib/types"

export function StoragePanel({ stats }: { stats: AdminStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top storage consumers</CardTitle>
      </CardHeader>
      <CardContent>
        {stats.storage.topStorage.length === 0 ? (
          <div className="text-muted-foreground py-6 text-center text-xs">
            No usage recorded yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {stats.storage.topStorage.map((u, i) => {
              const pct =
                u.quotaBytes > 0
                  ? Math.min(100, (u.usedBytes / u.quotaBytes) * 100)
                  : 0
              return (
                <li key={u.id} className="flex items-center gap-3">
                  <span className="text-muted-foreground w-4 text-xs">{i + 1}</span>
                  <Avatar className="h-6 w-6">
                    {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
                    <AvatarFallback>{u.name[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{u.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {formatBytes(u.usedBytes)} / {formatBytes(u.quotaBytes)}
                      </span>
                    </div>
                    <Progress
                      value={pct}
                      className="mt-1"
                      indicatorClassName={pct >= 80 ? "bg-destructive" : undefined}
                    />
                    <div className="text-muted-foreground mt-0.5 truncate text-xs">
                      {u.email} · {u.fileCount} file{u.fileCount === 1 ? "" : "s"}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
