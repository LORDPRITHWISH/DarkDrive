import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import type { AdminStats } from "@/lib/types"

export function HourlyChart({ stats }: { stats: AdminStats }) {
  const max = Math.max(1, ...stats.activity.hourlyLast7d)
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Activity by hour · last 7 days</CardTitle>
          <CardDescription>
            peak {String(stats.activity.peakHour).padStart(2, "0")}:00
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex h-24 items-end gap-1">
          {stats.activity.hourlyLast7d.map((c, h) => (
            <div
              key={h}
              className="flex flex-1 flex-col items-center gap-0.5"
              title={`${String(h).padStart(2, "0")}:00 → ${c}`}
            >
              <div className="flex h-full w-full items-end">
                <div
                  className={`w-full rounded-t-sm transition-all ${
                    h === stats.activity.peakHour ? "bg-destructive" : "bg-primary"
                  }`}
                  style={{ height: `${(c / max) * 100}%`, minHeight: c > 0 ? 2 : 0 }}
                />
              </div>
              <div
                className={`text-[10px] ${
                  h % 3 === 0 ? "text-muted-foreground" : "text-transparent"
                }`}
              >
                {String(h).padStart(2, "0")}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
