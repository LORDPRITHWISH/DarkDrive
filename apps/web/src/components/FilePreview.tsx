import { useEffect, useState } from "react"
import { XIcon, DownloadIcon } from "@phosphor-icons/react"
import type { FileItem } from "@/lib/types"
import { apiUrl } from "@/lib/config"
import { formatBytes, formatDate } from "@/lib/format"

export function FilePreview({
  file,
  onClose,
}: {
  file: FileItem | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!file) return
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [file, onClose])

  if (!file) return null
  const inlineSrc = apiUrl(`/api/files/${file.id}/download?inline=1`)
  const dlHref = apiUrl(`/api/files/${file.id}/download`)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] max-w-[95vw] overflow-hidden rounded-lg border bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center justify-center overflow-hidden bg-muted">
          <FileViewer file={file} src={inlineSrc} />
        </div>
        <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-auto border-l p-4">
          <div className="flex items-start justify-between gap-2">
            <h3
              className="min-w-0 flex-1 truncate font-semibold"
              title={file.name}
            >
              {file.name}
            </h3>
            <button
              className="shrink-0 rounded p-1 hover:bg-accent"
              onClick={onClose}
              aria-label="Close"
            >
              <XIcon size={18} />
            </button>
          </div>
          <a
            href={dlHref}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <DownloadIcon size={14} /> Download
          </a>
          <div className="border-t pt-3">
            <div className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Properties
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <Info label="Type" value={file.mimeType || "—"} />
              <Info label="Size" value={formatBytes(file.size)} />
              <Info label="Added" value={formatDate(file.createdAt)} />
              <Info label="Modified" value={formatDate(file.updatedAt)} />
              <Info label="Starred" value={file.isStarred ? "Yes" : "No"} />
              <Info label="Hidden" value={file.isHidden ? "Yes" : "No"} />
              <Info label="Trashed" value={file.isTrashed ? "Yes" : "No"} />
              <Info
                label="ID"
                value={
                  <span className="font-mono text-xs break-all">{file.id}</span>
                }
              />
              <Info
                label="Folder"
                value={
                  <span className="font-mono text-xs break-all">
                    {file.folderId}
                  </span>
                }
              />
              {file.spaceId && (
                <Info
                  label="Space"
                  value={
                    <span className="font-mono text-xs break-all">
                      {file.spaceId}
                    </span>
                  }
                />
              )}
              <Info
                label="Key"
                value={
                  <span className="font-mono text-xs break-all">
                    {file.storageKey}
                  </span>
                }
              />
            </dl>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </>
  )
}

function isCsvFile(m: string, name: string) {
  return m === "text/csv" || /\.(csv|tsv)$/i.test(name)
}

function isTextFile(m: string, name: string) {
  if (m.startsWith("text/")) return true
  const textMimes = [
    "application/json",
    "application/xml",
    "application/javascript",
    "application/x-sh",
    "application/x-yaml",
    "application/yaml",
    "application/toml",
    "application/x-sql",
    "application/x-httpd-php",
  ]
  if (textMimes.includes(m)) return true
  return /\.(md|txt|log|json|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|c|cpp|h|hpp|css|scss|less|html|htm|xml|svg|yml|yaml|toml|ini|conf|sh|bash|zsh|sql|env)$/i.test(
    name
  )
}

function isOfficeFile(m: string, name: string) {
  return (
    /\.(pptx?|docx?|xlsx?)$/i.test(name) ||
    m.includes("officedocument") ||
    m.includes("ms-powerpoint") ||
    m === "application/msword" ||
    m === "application/vnd.ms-excel"
  )
}

// "modal" layout caps media to the viewport minus the 20rem side panel and
// the modal's border. "fill" layout lets the viewer take 100% of its parent
// (used by callers that already give it a definite height, e.g. share pages).
const MODAL_MEDIA = {
  w: "max-w-[calc(95vw-20rem-2px)]",
  h: "max-h-[calc(90vh-2px)]",
  doc: "w-[calc(95vw-20rem-2px)] h-[calc(90vh-2px)] overflow-auto",
}
const FILL_MEDIA = {
  w: "max-w-full",
  h: "max-h-full",
  doc: "h-full w-full overflow-auto",
}

export type FileViewerLayout = "modal" | "fill"

// Exported so other surfaces (e.g. public share pages) can render a file
// inline using a caller-supplied URL without pulling in the full sidebar UI.
export function FileViewer({
  file,
  src,
  layout = "modal",
}: {
  file: FileItem
  src: string
  layout?: FileViewerLayout
}) {
  const mime = file.mimeType
  const sizing = layout === "fill" ? FILL_MEDIA : MODAL_MEDIA

  if (mime.startsWith("image/")) {
    return (
      <img
        src={src}
        alt={file.name}
        className={`block ${sizing.h} ${sizing.w} object-contain`}
      />
    )
  }
  if (mime.startsWith("video/")) {
    return (
      <video
        src={src}
        controls
        autoPlay
        className={`block bg-black ${sizing.h} ${sizing.w} ${
          layout === "fill" ? "h-full w-full" : ""
        }`}
      />
    )
  }
  if (mime.startsWith("audio/")) {
    return (
      <div className="flex w-md max-w-[80vw] items-center justify-center p-8">
        <audio src={src} controls className="w-full" />
      </div>
    )
  }
  if (mime === "application/pdf") {
    return (
      <iframe
        src={src}
        className={`${sizing.doc} border-0`}
        title={file.name}
      />
    )
  }
  if (isCsvFile(mime, file.name)) {
    return (
      <div className={sizing.doc}>
        <CsvPreview
          src={src}
          delimiter={/\.tsv$/i.test(file.name) ? "\t" : ","}
        />
      </div>
    )
  }
  if (isTextFile(mime, file.name)) {
    return (
      <div className={sizing.doc}>
        <TextPreview src={src} />
      </div>
    )
  }
  if (isOfficeFile(mime, file.name)) {
    return (
      <div className={sizing.doc}>
        <OfficePreview src={src} name={file.name} />
      </div>
    )
  }
  return (
    <div className="grid w-md max-w-[80vw] place-items-center p-10 text-center text-muted-foreground">
      <div>
        <div className="mb-2 text-lg">Preview not available</div>
        <div className="text-sm">Download the file to view it.</div>
      </div>
    </div>
  )
}

function TextPreview({ src }: { src: string }) {
  const [text, setText] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setText(null)
    setErr(null)
    fetch(src, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`http_${r.status}`)
        const t = await r.text()
        if (!cancelled) setText(t)
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [src])

  if (err)
    return (
      <div className="p-8 text-sm text-destructive">Failed to load: {err}</div>
    )
  if (text === null)
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>
  return <pre className="p-4 font-mono text-xs whitespace-pre">{text}</pre>
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === delimiter) {
        cur.push(field)
        field = ""
      } else if (c === "\n") {
        cur.push(field)
        rows.push(cur)
        cur = []
        field = ""
      } else if (c === "\r") {
        // skip
      } else {
        field += c
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field)
    rows.push(cur)
  }
  return rows
}

function CsvPreview({ src, delimiter }: { src: string; delimiter: string }) {
  const [rows, setRows] = useState<string[][] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    setErr(null)
    fetch(src, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`http_${r.status}`)
        const t = await r.text()
        if (!cancelled) setRows(parseCsv(t, delimiter))
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [src, delimiter])

  if (err)
    return (
      <div className="p-8 text-sm text-destructive">Failed to load: {err}</div>
    )
  if (!rows)
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>
  if (rows.length === 0)
    return <div className="p-8 text-sm text-muted-foreground">Empty</div>

  const [head, ...body] = rows
  return (
    <div className="overflow-auto p-2">
      <table className="border-collapse text-sm">
        <thead className="sticky top-0 bg-accent">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="border px-2 py-1 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri} className={ri % 2 ? "bg-muted/30" : ""}>
              {r.map((c, ci) => (
                <td key={ci} className="border px-2 py-1 whitespace-pre-wrap">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OfficePreview({ src, name }: { src: string; name: string }) {
  const full = new URL(src, window.location.origin).toString()
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(full)
  const viewer = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(full)}`

  if (isLocal) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-muted-foreground">
        <div className="mb-4 w-full max-w-2xl rounded border bg-muted p-4 text-left">
          <div className="mb-3 text-xs font-medium tracking-wider uppercase">
            Preview URLs
          </div>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="mb-1 text-xs font-medium text-muted-foreground">
                Viewer URL
              </dt>
              <dd className="rounded bg-background px-3 py-2 font-mono text-xs break-all text-foreground">
                {viewer}
              </dd>
            </div>
            <div>
              <dt className="mb-1 text-xs font-medium text-muted-foreground">
                Resolved Source
              </dt>
              <dd className="rounded bg-background px-3 py-2 font-mono text-xs break-all text-foreground">
                {full}
              </dd>
            </div>
            <div>
              <dt className="mb-1 text-xs font-medium text-muted-foreground">
                Original Source
              </dt>
              <dd className="rounded bg-background px-3 py-2 font-mono text-xs break-all text-foreground">
                {src}
              </dd>
            </div>
          </dl>
        </div>
        <div>
          <div className="mb-2 text-lg">Office preview needs a public URL</div>
          <div className="text-sm">
            The Office Web Viewer can't reach files served from localhost.
            <br />
            Download to view, or try again on the deployed site.
          </div>
        </div>
      </div>
    )
  }
  return (
    <>
      <div className="mb-4 w-full max-w-2xl rounded border bg-muted p-4 text-left">
        <div className="mb-3 text-xs font-medium tracking-wider uppercase">
          Preview URLs
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="mb-1 text-xs font-medium text-muted-foreground">
              Viewer URL
            </dt>
            <dd className="rounded bg-background px-3 py-2 font-mono text-xs break-all text-foreground">
              {viewer}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-xs font-medium text-muted-foreground">
              Resolved Source
            </dt>
            <dd className="rounded bg-background px-3 py-2 font-mono text-xs break-all text-foreground">
              {full}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-xs font-medium text-muted-foreground">
              Original Source
            </dt>
            <dd className="rounded bg-background px-3 py-2 font-mono text-xs break-all text-foreground">
              {src}
            </dd>
          </div>
        </dl>
      </div>
      <iframe
        src={viewer}
        className="h-full w-full border-0"
        title={name}
        allowFullScreen
      />
    </>
  )
}
