import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import {
  ArrowsOutCardinalIcon,
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  EyeIcon,
  ImageIcon,
  PaletteIcon,
  PencilSimpleIcon,
  PlusIcon,
  ShareNetworkIcon,
  StarIcon,
  TrashIcon,
  UploadSimpleIcon,
  UserIcon,
} from "@phosphor-icons/react"
import { apiGet } from "@/lib/api"
import { relativeTime } from "@/lib/format"
import { Avatar, AvatarImage, AvatarFallback } from "@workspace/ui/components/avatar"

export type ActivityEvent = {
  action: string
  at: string
  user: { name: string; avatarUrl: string | null } | null
  detail?: Record<string, unknown> | null
}

export type ActivityData = {
  stats: { views?: number; downloads?: number; lastActivity: string | null }
  recent: ActivityEvent[]
}

const ICON_SIZE = 12

const ACTION_META: Record<string, { label: string; icon: ReactNode; tone: "pos" | "neg" | "neu" }> = {
  view: { label: "viewed", icon: <EyeIcon size={ICON_SIZE} weight="bold" />, tone: "neu" },
  download: { label: "downloaded", icon: <DownloadSimpleIcon size={ICON_SIZE} weight="bold" />, tone: "neu" },
  upload: { label: "uploaded", icon: <UploadSimpleIcon size={ICON_SIZE} weight="bold" />, tone: "pos" },
  create: { label: "created", icon: <PlusIcon size={ICON_SIZE} weight="bold" />, tone: "pos" },
  rename: { label: "renamed", icon: <PencilSimpleIcon size={ICON_SIZE} weight="bold" />, tone: "neu" },
  move: { label: "moved", icon: <ArrowsOutCardinalIcon size={ICON_SIZE} weight="bold" />, tone: "neu" },
  star: { label: "starred", icon: <StarIcon size={ICON_SIZE} weight="bold" />, tone: "pos" },
  unstar: { label: "unstarred", icon: <StarIcon size={ICON_SIZE} weight="bold" />, tone: "neu" },
  trash: { label: "moved to trash", icon: <TrashIcon size={ICON_SIZE} weight="bold" />, tone: "neg" },
  restore: { label: "restored", icon: <ClockCounterClockwiseIcon size={ICON_SIZE} weight="bold" />, tone: "pos" },
  delete: { label: "permanently deleted", icon: <TrashIcon size={ICON_SIZE} weight="bold" />, tone: "neg" },
  share: { label: "shared", icon: <ShareNetworkIcon size={ICON_SIZE} weight="bold" />, tone: "pos" },
  unshare: { label: "removed a share on", icon: <ShareNetworkIcon size={ICON_SIZE} weight="bold" />, tone: "neg" },
  version: { label: "uploaded a new version of", icon: <UploadSimpleIcon size={ICON_SIZE} weight="bold" />, tone: "neu" },
  version_restore: {
    label: "restored a previous version of",
    icon: <ClockCounterClockwiseIcon size={ICON_SIZE} weight="bold" />,
    tone: "neu",
  },
  color: { label: "changed the color of", icon: <PaletteIcon size={ICON_SIZE} weight="bold" />, tone: "neu" },
  thumbnail: { label: "changed the thumbnail of", icon: <ImageIcon size={ICON_SIZE} weight="bold" />, tone: "neu" },
  owner: { label: "reassigned the owner of", icon: <UserIcon size={ICON_SIZE} weight="bold" />, tone: "neu" },
}
const DEFAULT_META = {
  label: "updated",
  icon: <ClockCounterClockwiseIcon size={ICON_SIZE} weight="bold" />,
  tone: "neu" as const,
}
const TONE_CLASS: Record<"pos" | "neg" | "neu", string> = {
  pos: "bg-green-500/10 text-green-500",
  neg: "bg-red-500/10 text-red-500",
  neu: "bg-blue-500/10 text-blue-500",
}

function detailSuffix(event: ActivityEvent): string {
  const to = event.detail?.to
  if ((event.action === "rename" || event.action === "move") && typeof to === "string")
    return ` to "${to}"`
  const permission = event.detail?.permission
  if (event.action === "share" && typeof permission === "string")
    return ` (${permission.toLowerCase()} access)`
  return ""
}

// Fetches and renders a mutation/access audit trail for a file or folder.
// Shared by FilePropertiesDialog and FolderPropertiesDialog's Activity tabs.
export function ActivityFeed({ endpoint }: { endpoint: string }) {
  const [data, setData] = useState<ActivityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setData(null)
      setErr(null)
      setLoading(true)
      try {
        const d = await apiGet<ActivityData>(endpoint)
        if (!cancelled) setData(d)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "failed")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [endpoint])

  if (loading)
    return <div className="text-muted-foreground py-10 text-center text-sm">Loading activity…</div>
  if (err)
    return <div className="text-destructive py-10 text-center text-sm">Failed to load: {err}</div>
  if (!data) return null

  const hasReadStats = data.stats.views !== undefined && data.stats.downloads !== undefined

  return (
    <div className="space-y-5">
      {hasReadStats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={<EyeIcon size={18} weight="fill" />} label="Views" value={data.stats.views!} />
          <StatCard
            icon={<DownloadSimpleIcon size={18} weight="fill" />}
            label="Downloads"
            value={data.stats.downloads!}
          />
          <StatCard
            icon={<ClockCounterClockwiseIcon size={18} weight="fill" />}
            label="Total"
            value={data.stats.views! + data.stats.downloads!}
          />
        </div>
      )}

      {data.stats.lastActivity && (
        <div className="text-muted-foreground text-xs">
          Last activity{" "}
          <span className="text-foreground font-medium">{relativeTime(data.stats.lastActivity)}</span>
        </div>
      )}

      {data.recent.length === 0 ? (
        <div className="text-muted-foreground py-6 text-center text-sm">No activity yet</div>
      ) : (
        <div className="space-y-0.5">
          <div className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Recent events
          </div>
          {data.recent.map((event, i) => (
            <EventRow key={i} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="bg-muted/50 flex flex-col items-center gap-1 rounded-xl border py-3 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">{label}</div>
    </div>
  )
}

function EventRow({ event }: { event: ActivityEvent }) {
  const meta = ACTION_META[event.action] ?? DEFAULT_META
  const name = event.user?.name ?? "Someone"
  return (
    <div className="hover:bg-accent/40 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors">
      <Avatar className="h-7 w-7 border">
        {event.user?.avatarUrl && <AvatarImage src={event.user.avatarUrl} alt={name} />}
        <AvatarFallback className="text-xs font-semibold uppercase">{name.charAt(0)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="text-muted-foreground text-sm">
          {" "}
          {meta.label}
          {detailSuffix(event)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span className={`rounded-md p-1 ${TONE_CLASS[meta.tone]}`}>{meta.icon}</span>
        <span className="text-muted-foreground text-xs tabular-nums">{relativeTime(event.at)}</span>
      </div>
    </div>
  )
}
