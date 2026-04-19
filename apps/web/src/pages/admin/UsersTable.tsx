import {
  CaretDownIcon,
  CheckCircleIcon,
  ProhibitIcon,
  XCircleIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Avatar, AvatarImage, AvatarFallback } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Progress } from "@workspace/ui/components/progress"
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
  { label: "500 MB", bytes: 500 * 1024 ** 2 },
  { label: "1 GB", bytes: 1 * 1024 ** 3 },
  { label: "5 GB", bytes: 5 * 1024 ** 3 },
  { label: "15 GB", bytes: 15 * 1024 ** 3 },
  { label: "50 GB", bytes: 50 * 1024 ** 3 },
  { label: "100 GB", bytes: 100 * 1024 ** 3 },
]

type UpdateFn = (
  id: string,
  patch: Record<string, unknown>
) => void | Promise<void>

export function UsersTable({
  users,
  meId,
  onUpdate,
}: {
  users: AdminUser[]
  meId?: string
  onUpdate: UpdateFn
}) {
  return (
    <Card className="p-0 gap-0">
      <CardHeader className="p-4">
        <CardTitle>Users</CardTitle>
      </CardHeader>
      <CardContent className="p-0 gap-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-[28%]">Usage</TableHead>
              <TableHead>Quota</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={meId === u.id}
                onUpdate={onUpdate}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function UserRow({
  user: u,
  isSelf,
  onUpdate,
}: {
  user: AdminUser
  isSelf: boolean
  onUpdate: UpdateFn
}) {
  const pct =
    u.storageQuotaBytes > 0
      ? Math.min(100, (u.usedBytes / u.storageQuotaBytes) * 100)
      : 0
  const isDisabled = !!u.disabledAt
  return (
    <TableRow className={isDisabled ? "opacity-60" : undefined}>
      <TableCell className="pl-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
            <AvatarFallback>{u.name[0]?.toUpperCase() ?? "?"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{u.name}</span>
              {isSelf && <Badge variant="muted">you</Badge>}
              {u.upgradeRequestedAt && (
                <Badge variant="default" title={formatDate(u.upgradeRequestedAt)}>
                  upgrade requested
                </Badge>
              )}
            </div>
            <div className="text-muted-foreground truncate text-xs">{u.email}</div>
          </div>
        </div>
      </TableCell>

      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                disabled={isSelf}
                title={isSelf ? "Can't change your own role" : undefined}
              />
            }
          >
            {u.role}
            <CaretDownIcon size={12} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Role</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={u.role === "USER"}
              onClick={() => onUpdate(u.id, { role: "USER" })}
            >
              USER
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={u.role === "ADMIN"}
              onClick={() => onUpdate(u.id, { role: "ADMIN" })}
            >
              ADMIN
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>

      <TableCell>
        <div className="flex flex-col gap-1">
          <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
            <span>{formatBytes(u.usedBytes)}</span>
            <span>{pct.toFixed(0)}%</span>
          </div>
          <Progress
            value={pct}
            indicatorClassName={pct >= 80 ? "bg-destructive" : undefined}
          />
        </div>
      </TableCell>

      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
            {formatBytes(u.storageQuotaBytes)}
            <CaretDownIcon size={12} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Set quota</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PRESETS.map((p) => (
              <DropdownMenuCheckboxItem
                key={p.label}
                checked={u.storageQuotaBytes === p.bytes}
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
      </TableCell>

      <TableCell>
        {isDisabled ? (
          <Badge
            variant="destructive"
            title={`Disabled ${formatDate(u.disabledAt!)}`}
          >
            Disabled
          </Badge>
        ) : (
          <Badge variant="muted">Active</Badge>
        )}
      </TableCell>

      <TableCell className="pr-4">
        <div className="flex items-center justify-end gap-1">
          {u.upgradeRequestedAt && (
            <PopConfirm
              title="Dismiss upgrade request?"
              description={`Requested ${formatDate(u.upgradeRequestedAt)}.`}
              confirmLabel="Dismiss"
              onConfirm={() => onUpdate(u.id, { clearUpgradeRequest: true })}
              trigger={
                <Button size="sm" variant="ghost" title="Dismiss upgrade request">
                  <XCircleIcon size={14} /> Dismiss
                </Button>
              }
            />
          )}
          {!isSelf &&
            (isDisabled ? (
              <PopConfirm
                title="Re-enable this account?"
                description="The user's sessions will start working again."
                confirmLabel="Enable"
                onConfirm={() => onUpdate(u.id, { disabled: false })}
                trigger={
                  <Button size="sm" variant="default">
                    <CheckCircleIcon size={14} /> Enable
                  </Button>
                }
              />
            ) : (
              <PopConfirm
                destructive
                title="Disable this account?"
                description="Active sessions will stop working and the user can no longer sign in until re-enabled."
                confirmLabel="Disable"
                onConfirm={() => onUpdate(u.id, { disabled: true })}
                trigger={
                  <Button size="sm" variant="destructive">
                    <ProhibitIcon size={14} /> Disable
                  </Button>
                }
              />
            ))}
        </div>
      </TableCell>
    </TableRow>
  )
}
