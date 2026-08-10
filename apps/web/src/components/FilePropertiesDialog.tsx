import { useEffect, useState } from "react"
import {
  DownloadSimpleIcon,
  EyeIcon,
  FileIcon,
  XIcon,
} from "@phosphor-icons/react"
import type { FileItem } from "@/lib/types"
import { apiGet } from "@/lib/api"
import { apiUrl } from "@/lib/config"
import { formatBytes, formatDate, relativeTime } from "@/lib/format"
import { iconFor } from "@/lib/fileIcon"
import { thumbnailable } from "@/lib/thumb"
import { useDrive } from "@/store/drive"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Avatar, AvatarImage, AvatarFallback } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Input } from "@workspace/ui/components/input"
import { HoverName } from "@/components/HoverName"

type ActivityEvent = {
  action: string
  accessedAt: string
  user: { name: string; avatarUrl: string | null }
}

type ActivityData = {
  stats: { views: number; downloads: number; lastAccessed: string | null }
  recent: ActivityEvent[]
}

type Tab = "info" | "activity"

export function FilePropertiesDialog({
  file,
  onClose,
}: {
  file: FileItem | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>("info")
  const [activity, setActivity] = useState<ActivityData | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityErr, setActivityErr] = useState<string | null>(null)
  const [thumbFailed, setThumbFailed] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const setFileTags = useDrive((s) => s.setFileTags)

  // Reset state when file changes
  useEffect(() => {
    if (!file) return
    setTab("info")
    setActivity(null)
    setActivityErr(null)
    setActivityLoading(false)
    setThumbFailed(false)
    setTags(file.tags ?? [])
    setTagInput("")
  }, [file?.id])

  function commitTags(next: string[]) {
    setTags(next)
    if (file) void setFileTags(file.id, next)
  }
  function addTag() {
    const t = tagInput.trim()
    setTagInput("")
    if (!t || tags.includes(t)) return
    commitTags([...tags, t])
  }

  // Load activity when Activity tab is first opened
  useEffect(() => {
    if (!file || tab !== "activity" || activity || activityLoading) return
    setActivityLoading(true)
    setActivityErr(null)
    apiGet<ActivityData>(`/api/files/${file.id}/activity`)
      .then((d) => setActivity(d))
      .catch((e) => setActivityErr(e instanceof Error ? e.message : "failed"))
      .finally(() => setActivityLoading(false))
  }, [file, tab, activity, activityLoading])

  if (!file) return null

  const showThumb = thumbnailable(file) && !thumbFailed
  const dlHref = apiUrl(`/api/files/${file.id}/download`)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-md flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="flex-row items-start gap-3 border-b px-5 py-4">
          <div className="mt-0.5 shrink-0">
            {iconFor(file.mimeType, 28, file.name)}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <DialogTitle className="min-w-0 truncate">
              <HoverName as="span" name={file.name} className="truncate" />
            </DialogTitle>
            <div className="text-muted-foreground mt-0.5 text-xs">
              {formatBytes(file.size)} · {file.mimeType || "unknown type"}
            </div>
          </div>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="min-h-0 flex-1 gap-0"
        >
          <TabsList className="px-5">
            <TabsTrigger value="info" className="capitalize">
              Info
            </TabsTrigger>
            <TabsTrigger value="activity" className="capitalize">
              Activity
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="info" className="space-y-4 p-5">
              {/* Thumbnail preview */}
              {showThumb && (
                <div className="overflow-hidden rounded-xl border">
                  <img
                    src={apiUrl(`/api/files/${file.id}/thumbnail`)}
                    alt=""
                    className="max-h-48 w-full object-cover"
                    onError={() => setThumbFailed(true)}
                  />
                </div>
              )}

              {/* Stats grid */}
              <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
                <Row label="Type" value={file.mimeType || "—"} mono />
                <Row label="Size" value={formatBytes(file.size)} />
                <Row label="Created" value={formatDate(file.createdAt)} />
                <Row label="Modified" value={formatDate(file.updatedAt)} />
                <Row label="Starred" value={file.isStarred ? "Yes" : "No"} />
                <Row label="Hidden" value={file.isHidden ? "Yes" : "No"} />
                {file.isShortcut && <Row label="Shortcut" value="Yes" />}
                <Row label="File ID" value={file.id} mono small />
                <Row label="Folder ID" value={file.folderId} mono small />
                {file.spaceId && (
                  <Row label="Space ID" value={file.spaceId} mono small />
                )}
                <Row label="Storage key" value={file.storageKey} mono small />
              </dl>

              {/* Tags */}
              <div className="border-t pt-3">
                <div className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
                  Tags
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {tags.map((t) => (
                    <Badge key={t} variant="secondary" className="pr-1">
                      {t}
                      <button
                        onClick={() => commitTags(tags.filter((x) => x !== t))}
                        title={`Remove "${t}"`}
                        className="hover:bg-foreground/10 rounded-full p-0.5"
                      >
                        <XIcon size={10} weight="bold" />
                      </button>
                    </Badge>
                  ))}
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault()
                        addTag()
                      }
                    }}
                    onBlur={addTag}
                    placeholder="Add tag…"
                    className="h-6 w-24 rounded-full px-2.5 text-xs"
                  />
                </div>
              </div>

              {/* Download link */}
              <div className="border-t pt-3">
                <a
                  href={dlHref}
                  className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline"
                >
                  <DownloadSimpleIcon size={15} weight="bold" />
                  Download file
                </a>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="p-5">
              {activityLoading && (
                <div className="text-muted-foreground py-10 text-center text-sm">
                  Loading activity…
                </div>
              )}
              {activityErr && (
                <div className="text-destructive py-10 text-center text-sm">
                  Failed to load: {activityErr}
                </div>
              )}
              {activity && (
                <div className="space-y-5">
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard
                      icon={<EyeIcon size={18} weight="fill" />}
                      label="Views"
                      value={activity.stats.views}
                    />
                    <StatCard
                      icon={<DownloadSimpleIcon size={18} weight="fill" />}
                      label="Downloads"
                      value={activity.stats.downloads}
                    />
                    <StatCard
                      icon={<FileIcon size={18} weight="fill" />}
                      label="Total"
                      value={activity.stats.views + activity.stats.downloads}
                    />
                  </div>

                  {activity.stats.lastAccessed && (
                    <div className="text-muted-foreground text-xs">
                      Last accessed{" "}
                      <span className="text-foreground font-medium">
                        {relativeTime(activity.stats.lastAccessed)}
                      </span>
                    </div>
                  )}

                  {/* Event log */}
                  {activity.recent.length === 0 ? (
                    <div className="text-muted-foreground py-6 text-center text-sm">
                      No activity yet
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <div className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
                        Recent events
                      </div>
                      {activity.recent.map((event, i) => (
                        <EventRow key={i} event={event} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function Row({
  label,
  value,
  mono,
  small,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  small?: boolean
}) {
  return (
    <>
      <dt className="text-muted-foreground self-start pt-px">{label}</dt>
      <dd
        className={`min-w-0 break-all ${mono ? "font-mono" : ""} ${small ? "text-xs" : ""}`}
      >
        {value}
      </dd>
    </>
  )
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="bg-muted/50 flex flex-col items-center gap-1 rounded-xl border py-3 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
        {label}
      </div>
    </div>
  )
}

function EventRow({ event }: { event: ActivityEvent }) {
  const isDownload = event.action === "download"
  return (
    <div className="hover:bg-accent/40 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors">
      <Avatar className="h-7 w-7 border">
        {event.user.avatarUrl && (
          <AvatarImage src={event.user.avatarUrl} alt={event.user.name} />
        )}
        <AvatarFallback className="text-xs font-semibold uppercase">
          {event.user.name.charAt(0)}
        </AvatarFallback>
      </Avatar>

      {/* User + action */}
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-medium">{event.user.name}</span>
        <span className="text-muted-foreground text-sm">
          {" "}
          {isDownload ? "downloaded" : "viewed"}
        </span>
      </div>

      {/* Icon + time */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={`rounded-md p-1 ${
            isDownload
              ? "bg-blue-500/10 text-blue-500"
              : "bg-green-500/10 text-green-500"
          }`}
        >
          {isDownload ? (
            <DownloadSimpleIcon size={12} weight="bold" />
          ) : (
            <EyeIcon size={12} weight="bold" />
          )}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {relativeTime(event.accessedAt)}
        </span>
      </div>
    </div>
  )
}
