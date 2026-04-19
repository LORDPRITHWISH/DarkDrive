import {
  DesktopIcon,
  DeviceMobileIcon,
  DeviceTabletIcon,
  SignInIcon,
} from "@phosphor-icons/react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card"
import { Avatar, AvatarImage, AvatarFallback } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { formatDate, relativeTime } from "@/lib/format"
import type { AdminStats } from "@/lib/types"
import type { ComponentType } from "react"

function parseAgent(ua: string | null) {
  if (!ua)
    return {
      Device: DesktopIcon as ComponentType<{ size?: number; weight?: "fill" | "regular" }>,
      os: "unknown",
      browser: "",
    }
  let os = "Other"
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS"
  else if (/Android/.test(ua)) os = "Android"
  else if (/Mac OS X/.test(ua)) os = "macOS"
  else if (/Windows/.test(ua)) os = "Windows"
  else if (/Linux/.test(ua)) os = "Linux"

  let browser = ""
  if (/Edg\//.test(ua)) browser = "Edge"
  else if (/Chrome\//.test(ua)) browser = "Chrome"
  else if (/Firefox\//.test(ua)) browser = "Firefox"
  else if (/Safari\//.test(ua)) browser = "Safari"

  const Device =
    /iPad|Tablet/.test(ua)
      ? DeviceTabletIcon
      : /Mobile|iPhone|Android/.test(ua)
        ? DeviceMobileIcon
        : DesktopIcon
  return {
    Device: Device as ComponentType<{ size?: number; weight?: "fill" | "regular" }>,
    os,
    browser,
  }
}

function prettyIp(ip: string | null): string {
  if (!ip) return "unknown"
  if (ip === "::1" || ip === "127.0.0.1") return "localhost"
  // IPv4-mapped IPv6
  if (ip.startsWith("::ffff:")) return ip.slice(7)
  return ip
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
          <ul className="flex flex-col">
            {stats.logins.recent.map((l) => {
              const { Device, os, browser } = parseAgent(l.userAgent)
              return (
                <li
                  key={l.id}
                  className="hover:bg-accent/30 -mx-2 flex items-center gap-3 rounded-md px-2 py-2"
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    {l.user.avatarUrl && (
                      <AvatarImage src={l.user.avatarUrl} alt="" />
                    )}
                    <AvatarFallback>
                      {l.user.name[0]?.toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted grid h-6 w-6 shrink-0 place-items-center rounded-full">
                    <SignInIcon
                      size={12}
                      weight="fill"
                      className="text-muted-foreground"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="truncate font-medium">{l.user.name}</span>
                      <span className="text-muted-foreground text-xs">
                        signed in
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                      <Device size={12} />
                      <span>
                        {os}
                        {browser && ` · ${browser}`}
                      </span>
                      <span>·</span>
                      <Badge variant="muted" className="font-mono text-[10px]">
                        {prettyIp(l.ip)}
                      </Badge>
                    </div>
                  </div>
                  <span
                    className="text-muted-foreground shrink-0 text-xs tabular-nums"
                    title={formatDate(l.createdAt)}
                  >
                    {relativeTime(l.createdAt)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
