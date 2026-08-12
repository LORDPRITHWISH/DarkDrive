import { useEffect, useRef, useState } from "react"
import {
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react"
import type { FileItem } from "@/lib/types"
import { apiGet, apiJson } from "@/lib/api"
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
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { HoverName } from "@/components/HoverName"
import { ActivityFeed } from "@/components/ActivityFeed"

type VersionAuthor = { name: string; avatarUrl: string | null } | null

type VersionsData = {
  current: { size: number; mimeType: string; updatedAt: string; uploadedBy: VersionAuthor }
  versions: {
    id: string
    size: number
    mimeType: string
    createdAt: string
    uploadedBy: VersionAuthor
  }[]
}

type Tab = "info" | "activity" | "versions"

export function FilePropertiesDialog({
  file,
  onClose,
}: {
  file: FileItem | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>("info")
  const [versions, setVersions] = useState<VersionsData | null>(null)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionsErr, setVersionsErr] = useState<string | null>(null)
  const [uploadingVersion, setUploadingVersion] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const versionFileInput = useRef<HTMLInputElement>(null)
  const [thumbFailed, setThumbFailed] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const setFileTags = useDrive((s) => s.setFileTags)
  const replaceFile = useDrive((s) => s.replaceFile)

  // Reset state when file changes
  useEffect(() => {
    if (!file) return
    setTab("info")
    setVersions(null)
    setVersionsErr(null)
    setVersionsLoading(false)
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

  // Load version history when the Versions tab is first opened
  useEffect(() => {
    if (!file || tab !== "versions" || versions || versionsLoading) return
    setVersionsLoading(true)
    setVersionsErr(null)
    apiGet<VersionsData>(`/api/files/${file.id}/versions`)
      .then((d) => setVersions(d))
      .catch((e) => setVersionsErr(e instanceof Error ? e.message : "failed"))
      .finally(() => setVersionsLoading(false))
  }, [file, tab, versions, versionsLoading])

  async function reloadVersions() {
    if (!file) return
    try {
      setVersions(await apiGet<VersionsData>(`/api/files/${file.id}/versions`))
    } catch {}
  }

  async function pickNewVersion(f: File) {
    if (!file) return
    setUploadingVersion(true)
    try {
      await replaceFile(file.id, f)
      await reloadVersions()
    } catch {
      // Failure is already surfaced via the upload toaster.
    } finally {
      setUploadingVersion(false)
    }
  }

  async function restoreVersion(versionId: string) {
    if (!file) return
    setRestoringId(versionId)
    try {
      await apiJson(`/api/files/${file.id}/versions/${versionId}/restore`, "POST")
      await reloadVersions()
      void useDrive.getState().refresh()
    } finally {
      setRestoringId(null)
    }
  }

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
            <TabsTrigger value="versions" className="capitalize">
              Versions
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
              <ActivityFeed endpoint={`/api/files/${file.id}/activity`} />
            </TabsContent>

            <TabsContent value="versions" className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  Version history
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={uploadingVersion}
                  onClick={() => versionFileInput.current?.click()}
                >
                  <UploadSimpleIcon size={13} weight="bold" />
                  {uploadingVersion ? "Uploading…" : "Upload new version"}
                </Button>
                <input
                  ref={versionFileInput}
                  type="file"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ""
                    if (f) void pickNewVersion(f)
                  }}
                />
              </div>

              {versionsLoading && (
                <div className="text-muted-foreground py-10 text-center text-sm">
                  Loading versions…
                </div>
              )}
              {versionsErr && (
                <div className="text-destructive py-10 text-center text-sm">
                  Failed to load: {versionsErr}
                </div>
              )}
              {versions && (
                <div className="space-y-0.5">
                  <VersionRow
                    current
                    size={versions.current.size}
                    at={versions.current.updatedAt}
                    uploadedBy={versions.current.uploadedBy}
                  />
                  {versions.versions.map((v) => (
                    <VersionRow
                      key={v.id}
                      size={v.size}
                      at={v.createdAt}
                      uploadedBy={v.uploadedBy}
                      downloadHref={apiUrl(`/api/files/${file.id}/versions/${v.id}/download`)}
                      onRestore={() => restoreVersion(v.id)}
                      restoring={restoringId === v.id}
                    />
                  ))}
                  {versions.versions.length === 0 && (
                    <div className="text-muted-foreground py-6 text-center text-sm">
                      No earlier versions — upload a new version to start keeping history.
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

function VersionRow({
  current,
  size,
  at,
  uploadedBy,
  downloadHref,
  onRestore,
  restoring,
}: {
  current?: boolean
  size: number
  at: string
  uploadedBy: VersionAuthor
  downloadHref?: string
  onRestore?: () => void
  restoring?: boolean
}) {
  const name = uploadedBy?.name ?? "Unknown"
  return (
    <div className="hover:bg-accent/40 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors">
      <Avatar className="h-7 w-7 border">
        {uploadedBy?.avatarUrl && <AvatarImage src={uploadedBy.avatarUrl} alt={name} />}
        <AvatarFallback className="text-xs font-semibold uppercase">
          {name.charAt(0)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{name}</span>
          {current && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              Current
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground text-xs">
          {formatBytes(size)} · {relativeTime(at)}
        </div>
      </div>

      {!current && (
        <div className="flex shrink-0 items-center gap-1">
          {downloadHref && (
            <a
              href={downloadHref}
              title="Download this version"
              className="hover:bg-accent text-muted-foreground rounded-md p-1.5"
            >
              <DownloadSimpleIcon size={14} weight="bold" />
            </a>
          )}
          <button
            onClick={onRestore}
            disabled={restoring}
            title="Restore this version"
            className="hover:bg-accent text-muted-foreground rounded-md p-1.5 disabled:opacity-50"
          >
            <ClockCounterClockwiseIcon size={14} weight="bold" />
          </button>
        </div>
      )}
    </div>
  )
}
