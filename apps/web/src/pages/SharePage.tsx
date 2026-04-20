import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import {
  DownloadIcon,
  XIcon,
  FolderIcon,
  ArrowRightIcon,
  LinkIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { formatBytes, formatDate } from "@/lib/format"
import { apiUrl } from "@/lib/config"
import { iconFor } from "@/lib/fileIcon"
import { FileViewer } from "@/components/FilePreview"
import type { FileItem, Folder } from "@/lib/types"

function ShareShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-background/80 sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6">
        <Link
          to="/landing"
          title="About DarkDrive"
          className="hover:text-primary flex items-center gap-2 transition-colors"
        >
          <img
            src="/DarkDrive.png"
            alt="DarkDrive"
            className="h-7 w-7 rounded-md"
          />
          <span className="text-base font-semibold tracking-tight">
            DarkDrive
          </span>
          <span className="bg-accent text-accent-foreground ml-2 hidden items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-flex">
            <LinkIcon size={11} /> Shared link
          </span>
        </Link>
        <Button size="sm" variant="outline" render={<Link to="/" />}>
          Open DarkDrive
          <ArrowRightIcon size={14} />
        </Button>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      <footer className="text-muted-foreground border-t px-4 py-3 text-center text-xs sm:px-6">
        Shared via{" "}
        <Link
          to="/landing"
          className="text-foreground font-medium hover:underline"
        >
          DarkDrive
        </Link>
      </footer>
    </div>
  )
}

type Resolved =
  | { type: "FILE"; permission: "VIEW" | "EDIT"; file: FileItem }
  | {
      type: "FOLDER"
      permission: "VIEW" | "EDIT"
      folder: Folder
      folders: Folder[]
      files: FileItem[]
    }

function shareInlineUrl(token: string, fileId?: string) {
  return apiUrl(
    `/api/shares/${token}/download${fileId ? `/${fileId}` : ""}?inline=1`
  )
}

function shareDownloadUrl(token: string, fileId?: string) {
  return apiUrl(
    `/api/shares/${token}/download${fileId ? `/${fileId}` : ""}`
  )
}

export function SharePage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<Resolved | null>(null)
  const [pwPrompt, setPwPrompt] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<FileItem | null>(null)

  async function resolve(pw?: string) {
    const res = await fetch(apiUrl(`/api/shares/resolve/${token}`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pw ? { password: pw } : {}),
    })
    if (res.status === 401) {
      setPwPrompt(true)
      return
    }
    if (!res.ok) {
      setError((await res.json()).error)
      return
    }
    setData(await res.json())
    setPwPrompt(false)
  }

  useEffect(() => {
    void resolve()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (error)
    return (
      <ShareShell>
        <div className="grid min-h-[60vh] place-items-center p-6">
          <div className="text-destructive">Link unavailable: {error}</div>
        </div>
      </ShareShell>
    )

  if (pwPrompt)
    return (
      <ShareShell>
        <div className="grid min-h-[60vh] place-items-center p-4">
          <div className="bg-card w-full max-w-sm rounded-xl border p-6">
            <div className="mb-2 font-medium">Password required</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-background w-full rounded-md border px-3 py-2"
            />
            <Button className="mt-3 w-full" onClick={() => resolve(password)}>
              Unlock
            </Button>
          </div>
        </div>
      </ShareShell>
    )

  if (!data)
    return (
      <ShareShell>
        <div className="p-8">Loading…</div>
      </ShareShell>
    )

  if (data.type === "FILE") {
    const f = data.file
    return (
      <ShareShell>
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold" title={f.name}>
                {f.name}
              </h1>
              <div className="text-muted-foreground text-sm">
                {f.mimeType || "unknown"} · {formatBytes(f.size)}
              </div>
            </div>
            <a
              href={shareDownloadUrl(token!)}
              className="bg-primary text-primary-foreground hover:bg-primary/80 inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium"
            >
              <DownloadIcon size={14} /> Download
            </a>
          </div>
          <div className="bg-muted grid min-h-0 flex-1 place-items-center overflow-hidden rounded-xl border">
            <FileViewer file={f} src={shareInlineUrl(token!)} layout="fill" />
          </div>
        </div>
      </ShareShell>
    )
  }

  return (
    <ShareShell>
      <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 text-lg font-semibold">{data.folder.name}</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {data.folders.map((f) => (
          <div
            key={f.id}
            className="bg-card flex items-center gap-3 rounded-lg border p-3 opacity-60"
          >
            <FolderIcon
              size={24}
              weight="fill"
              style={{ color: f.color || undefined }}
              className={f.color ? "" : "text-primary"}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{f.name}</div>
              <div className="text-muted-foreground text-xs">
                Subfolder (browse via owner)
              </div>
            </div>
          </div>
        ))}
        {data.files.map((f) => {
          const isImg = f.mimeType.startsWith("image/")
          return (
            <button
              key={f.id}
              onClick={() => setPreview(f)}
              className="bg-card hover:border-primary/60 overflow-hidden rounded-lg border text-left transition-colors"
            >
              <div className="bg-muted grid aspect-4/3 place-items-center overflow-hidden">
                {isImg ? (
                  <img
                    src={shareInlineUrl(token!, f.id)}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  iconFor(f.mimeType, 56, f.name)
                )}
              </div>
              <div className="p-2">
                <div className="truncate text-sm font-medium" title={f.name}>
                  {f.name}
                </div>
                <div className="text-muted-foreground flex items-center justify-between text-xs">
                  <span>{formatBytes(f.size)}</span>
                  <span>{formatDate(f.createdAt)}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {preview && (
        <SharedFileModal
          file={preview}
          token={token!}
          onClose={() => setPreview(null)}
        />
      )}
      </div>
    </ShareShell>
  )
}

function SharedFileModal({
  file,
  token,
  onClose,
}: {
  file: FileItem
  token: string
  onClose: () => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background flex max-h-[90vh] max-w-[95vw] overflow-hidden rounded-lg border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-muted flex min-w-0 items-center justify-center overflow-hidden">
          <FileViewer file={file} src={shareInlineUrl(token, file.id)} />
        </div>
        <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-auto border-l p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 truncate font-semibold" title={file.name}>
              {file.name}
            </h3>
            <button
              className="hover:bg-accent shrink-0 rounded p-1"
              onClick={onClose}
              aria-label="Close"
            >
              <XIcon size={18} />
            </button>
          </div>
          <a
            href={shareDownloadUrl(token, file.id)}
            className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline"
          >
            <DownloadIcon size={14} /> Download
          </a>
          <div className="text-muted-foreground border-t pt-3 text-sm">
            <div>{file.mimeType || "unknown"}</div>
            <div>{formatBytes(file.size)}</div>
            <div>Added {formatDate(file.createdAt)}</div>
          </div>
        </aside>
      </div>
    </div>
  )
}
