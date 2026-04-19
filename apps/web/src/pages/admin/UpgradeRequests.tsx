import {
  ArrowRightIcon,
  CaretDownIcon,
  CheckIcon,
  XIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card"
import { Avatar, AvatarImage, AvatarFallback } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { PopConfirm } from "@workspace/ui/components/popconfirm"
import { formatBytes, formatDate } from "@/lib/format"
import type { AdminUser } from "@/lib/types"

const PRESETS = [
  { label: "5 GB", bytes: 5 * 1024 ** 3 },
  { label: "10 GB", bytes: 10 * 1024 ** 3 },
  { label: "15 GB", bytes: 15 * 1024 ** 3 },
  { label: "20 GB", bytes: 20 * 1024 ** 3 },
  { label: "50 GB", bytes: 50 * 1024 ** 3 },
  { label: "100 GB", bytes: 100 * 1024 ** 3 },
  { label: "500 GB", bytes: 500 * 1024 ** 3 },
]

type Props = {
  users: AdminUser[]
  onUpdate: (
    id: string,
    patch: Record<string, unknown>
  ) => void | Promise<void>
}

export function UpgradeRequests({ users, onUpdate }: Props) {
  const requesters = users.filter((u) => u.upgradeRequestedAt)

  if (requesters.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Upgrade requests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground py-10 text-center text-sm">
            No upgrade requests right now.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="p-0 gap-0">
      <CardHeader className="p-4">
        <CardTitle>Upgrade requests · {requesters.length}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 gap-0">
        <ul className="divide-y">
          {requesters.map((u) => (
            <RequestRow key={u.id} user={u} onUpdate={onUpdate} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function RequestRow({
  user: u,
  onUpdate,
}: {
  user: AdminUser
  onUpdate: Props["onUpdate"]
}) {
  const requested = u.upgradeRequestedBytes
  const pct =
    u.storageQuotaBytes > 0
      ? Math.min(100, (u.usedBytes / u.storageQuotaBytes) * 100)
      : 0

  return (
    <li className="flex flex-wrap items-center gap-4 p-4">
      <Avatar className="h-9 w-9">
        {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
        <AvatarFallback>{u.name[0]?.toUpperCase() ?? "?"}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{u.name}</span>
          <Badge variant="muted" className="tabular-nums">
            {pct.toFixed(0)}% used
          </Badge>
        </div>
        <div className="text-muted-foreground truncate text-xs">{u.email}</div>
        <div className="text-muted-foreground mt-1 text-xs">
          Requested {formatDate(u.upgradeRequestedAt!)}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm tabular-nums">
        <span className="text-muted-foreground">
          {formatBytes(u.storageQuotaBytes)}
        </span>
        <ArrowRightIcon size={14} className="text-muted-foreground" />
        <span className="font-semibold">
          {requested ? formatBytes(requested) : "—"}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {requested && (
          <PopConfirm
            title="Accept requested quota?"
            description={`Grants ${formatBytes(requested)} to ${u.name}.`}
            confirmLabel="Accept"
            onConfirm={() =>
              onUpdate(u.id, {
                storageQuotaBytes: requested,
                clearUpgradeRequest: true,
              })
            }
            trigger={
              <Button size="sm" variant="default">
                <CheckIcon size={14} /> Accept
              </Button>
            }
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
            Custom
            <CaretDownIcon size={12} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Grant a different quota</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PRESETS.filter((p) => p.bytes > u.storageQuotaBytes).map((p) => (
              <DropdownMenuCheckboxItem
                key={p.label}
                checked={p.bytes === requested}
                onClick={() =>
                  onUpdate(u.id, {
                    storageQuotaBytes: p.bytes,
                    clearUpgradeRequest: true,
                  })
                }
              >
                {p.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <PopConfirm
          title="Dismiss this request?"
          description="The user's quota stays unchanged and they can request again."
          confirmLabel="Dismiss"
          onConfirm={() => onUpdate(u.id, { clearUpgradeRequest: true })}
          trigger={
            <Button size="sm" variant="ghost" title="Dismiss">
              <XIcon size={14} />
            </Button>
          }
        />
      </div>
    </li>
  )
}
