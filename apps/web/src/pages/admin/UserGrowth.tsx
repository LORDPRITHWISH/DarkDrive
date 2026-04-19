import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import type { AdminStats } from "@/lib/types"

export function UserGrowth({ stats }: { stats: AdminStats }) {
  const max = Math.max(1, ...stats.users.growth.map((g) => g.count))
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Signups — last 12 months</CardTitle>
          <CardDescription>+{stats.users.newLast30d} in last 30d</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex h-32 items-end gap-1.5">
          {stats.users.growth.map((g) => {
            const h = (g.count / max) * 100
            return (
              <div key={g.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-full w-full items-end">
                  <div
                    className="bg-primary w-full rounded-t-sm transition-all"
                    style={{ height: `${h}%`, minHeight: g.count > 0 ? 2 : 0 }}
                    title={`${g.month}: ${g.count}`}
                  />
                </div>
                <div className="text-muted-foreground text-[10px]">
                  {g.month.slice(5)}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
