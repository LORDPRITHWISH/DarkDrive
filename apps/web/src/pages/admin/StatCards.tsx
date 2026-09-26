import {
  UsersThreeIcon,
  CloudIcon,
  FilesIcon,
  LightningIcon,
} from "@phosphor-icons/react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { formatBytes } from "@/lib/format"
import NumberTicker from "@/components/magicui/NumberTicker"
import type { AdminStats } from "@/lib/types"

export function StatCards({ stats }: { stats: AdminStats }) {
  const { usedBytes, trashedBytes, recycleBinBytes, totalQuotaBytes } = stats.storage
  // Everything still on disk: live + user bins + admin recycle bin (which is
  // retained until an admin purges it, so it must be counted too).
  const onDiskBytes = usedBytes + trashedBytes + recycleBinBytes
  const storagePct =
    totalQuotaBytes > 0 ? Math.min(100, (onDiskBytes / totalQuotaBytes) * 100) : 0
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<UsersThreeIcon size={16} />}
        label="Total users"
        value={<NumberTicker value={stats.users.total} />}
        hint={`${stats.users.active} active · ${stats.users.disabled} disabled · ${stats.users.admins} admins`}
      />
      <StatCard
        icon={<CloudIcon size={16} />}
        label="Storage used"
        value={formatBytes(onDiskBytes)}
        hint={`of ${formatBytes(totalQuotaBytes)} (${storagePct.toFixed(0)}%) · ${formatBytes(usedBytes)} live · ${formatBytes(trashedBytes)} trash · ${formatBytes(recycleBinBytes)} recycle bin`}
        progress={storagePct}
      />
      <StatCard
        icon={<FilesIcon size={16} />}
        label="Total files"
        value={<NumberTicker value={stats.files.total} />}
        hint={`${stats.storage.trashedCount} in trash · ${formatBytes(stats.storage.trashedBytes)}`}
      />
      <StatCard
        icon={<LightningIcon size={16} />}
        label="Activity (7d)"
        value={<NumberTicker value={stats.activity.accesses7d} />}
        hint={`${stats.activity.accesses30d.toLocaleString()} in 30d · peak ${String(stats.activity.peakHour).padStart(2, "0")}:00`}
      />
    </div>
  )
}

export function StatCard({
  icon,
  label,
  value,
  hint,
  progress,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  hint: string
  progress?: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="gap-2">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {typeof progress === "number" && (
          <Progress
            value={progress}
            indicatorClassName={progress >= 80 ? "bg-destructive" : undefined}
          />
        )}
        <CardDescription>{hint}</CardDescription>
      </CardContent>
    </Card>
  )
}
