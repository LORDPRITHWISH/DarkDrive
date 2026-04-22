import { Suspense, lazy, useEffect, useEffectEvent, useState } from "react"
import { XIcon, DownloadIcon } from "@phosphor-icons/react"
import type { FileItem } from "@/lib/types"
import { apiUrl } from "@/lib/config"
import { formatBytes, formatDate } from "@/lib/format"

const LazyPdfViewer = lazy(async () => {
  const module = await import("@/components/PdfViewer")
  return { default: module.PdfViewer }
})

export function FilePreview({
  file,
  onClose,
}: {
  file: FileItem | null
  onClose: () => void
}) {
  const [officeProviderState, setOfficeProviderState] = useState<{
    fileId: string | null
    provider: OfficeProvider
  }>({ fileId: null, provider: "office" })
  const [pdfFocusState, setPdfFocusState] = useState<{
    fileId: string | null
    focused: boolean
  }>({ fileId: null, focused: false })

  const handleEscape = useEffectEvent((e: KeyboardEvent) => {
    if (!file || e.key !== "Escape") return

    if (
      isPdfFile(file.mimeType, file.name) &&
      pdfFocusState.fileId === file.id &&
      pdfFocusState.focused
    ) {
      e.preventDefault()
      setPdfFocusState({ fileId: file.id, focused: false })
      return
    }

    onClose()
  })

  useEffect(() => {
    if (!file) return
    const onKeyDown = (event: KeyboardEvent) => {
      handleEscape(event)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [file])

  if (!file) return null
  const officeFile = isOfficeFile(file.mimeType, file.name)
  const pdfFile = isPdfFile(file.mimeType, file.name)
  const pdfFocusMode =
    pdfFile && pdfFocusState.fileId === file.id && pdfFocusState.focused
  const officeProvider =
    officeFile && officeProviderState.fileId === file.id
      ? officeProviderState.provider
      : "office"
  const inlineSrc = apiUrl(`/api/files/${file.id}/download?inline=1`)
  const viewSrc =
    officeFile || pdfFile ? apiUrl(`/api/files/${file.id}/preview`) : inlineSrc
  const dlHref = apiUrl(`/api/files/${file.id}/download`)

  const handleOfficeProviderChange = (provider: OfficeProvider) => {
    setOfficeProviderState({ fileId: file.id, provider })
  }

  const handlePdfFocusModeChange = (focused: boolean) => {
    setPdfFocusState({ fileId: file.id, focused })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className={`flex overflow-hidden rounded-lg border bg-background transition-[width,height,max-width,max-height] duration-300 ${
          pdfFocusMode ? "h-[94vh] w-[96vw]" : "max-h-[90vh] max-w-[95vw]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex min-w-0 overflow-hidden ${
            pdfFocusMode
              ? "flex-1 bg-transparent"
              : "items-center justify-center bg-muted"
          }`}
        >
          <FileViewer
            file={file}
            src={viewSrc}
            layout={pdfFocusMode ? "fill" : "modal"}
            officeProvider={officeProvider}
            onPdfFocusModeChange={handlePdfFocusModeChange}
          />
        </div>
        {!pdfFocusMode && (
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
            {officeFile && (
              <div className="border-t pt-3">
                <div className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Preview Provider
                </div>
                <OfficeProviderSwitch
                  provider={officeProvider}
                  onChange={handleOfficeProviderChange}
                />
              </div>
            )}
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
                    <span className="font-mono text-xs break-all">
                      {file.id}
                    </span>
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
        )}
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

function isPdfFile(m: string, name: string) {
  return m === "application/pdf" || /\.pdf$/i.test(name)
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
  officeProvider = "office",
  onPdfFocusModeChange,
}: {
  file: FileItem
  src: string
  layout?: FileViewerLayout
  officeProvider?: OfficeProvider
  onPdfFocusModeChange?: (focused: boolean) => void
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
  if (isPdfFile(mime, file.name)) {
    return (
      <div className={sizing.doc}>
        <Suspense
          fallback={
            <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">
              Loading PDF viewer…
            </div>
          }
        >
          <LazyPdfViewer
            fileId={file.id}
            name={file.name}
            src={src}
            layout={layout}
            onFocusModeChange={onPdfFocusModeChange}
          />
        </Suspense>
      </div>
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
        <OfficePreview src={src} name={file.name} provider={officeProvider} />
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
  const [state, setState] = useState<{
    src: string
    text: string | null
    err: string | null
  }>({ src, text: null, err: null })

  useEffect(() => {
    let cancelled = false
    fetch(src, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`http_${r.status}`)
        const t = await r.text()
        if (!cancelled) setState({ src, text: t, err: null })
      })
      .catch((e) => {
        if (!cancelled) setState({ src, text: null, err: e.message })
      })
    return () => {
      cancelled = true
    }
  }, [src])

  if (state.src !== src)
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>
  if (state.err)
    return (
      <div className="p-8 text-sm text-destructive">
        Failed to load: {state.err}
      </div>
    )
  if (state.text === null)
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>
  return (
    <pre className="p-4 font-mono text-xs whitespace-pre">{state.text}</pre>
  )
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
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const requestKey = `${src}::${delimiter}`

  useEffect(() => {
    let cancelled = false
    fetch(src, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`http_${r.status}`)
        const t = await r.text()
        if (!cancelled) {
          setRows(parseCsv(t, delimiter))
          setErr(null)
          setLoadedKey(requestKey)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setRows(null)
          setErr(e.message)
          setLoadedKey(requestKey)
        }
      })
    return () => {
      cancelled = true
    }
  }, [src, delimiter, requestKey])

  if (loadedKey !== requestKey)
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>

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

type OfficeProvider = "office" | "google"

function buildOfficeViewerUrl(provider: OfficeProvider, sourceUrl: string) {
  if (provider === "google") {
    return `https://drive.google.com/viewer?embedded=true&url=${encodeURIComponent(sourceUrl)}`
  }
  return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(sourceUrl)}`
}

function OfficeProviderSwitch({
  provider,
  onChange,
}: {
  provider: OfficeProvider
  onChange: (provider: OfficeProvider) => void
}) {
  return (
    <div className="inline-flex rounded-lg border bg-background p-1">
      <button
        type="button"
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
          provider === "office"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => onChange("office")}
        aria-pressed={provider === "office"}
      >
        Office
      </button>
      <button
        type="button"
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
          provider === "google"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => onChange("google")}
        aria-pressed={provider === "google"}
      >
        Google
      </button>
    </div>
  )
}

function OfficePreview({
  src,
  name,
  provider,
}: {
  src: string
  name: string
  provider: OfficeProvider
}) {
  const [resolved, setResolved] = useState<{
    src: string
    sourceUrl: string
    expiresAt: string | null
  } | null>(null)
  const [err, setErr] = useState<{ src: string; message: string } | null>(null)

  const full = new URL(
    src,
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  )
  const usesServerPreview = /^\/api\/files\/[^/]+\/preview$/.test(full.pathname)
  const directSourceUrl = usesServerPreview ? null : full.toString()

  useEffect(() => {
    let cancelled = false

    if (!usesServerPreview) {
      return () => {
        cancelled = true
      }
    }

    const requestUrl = new URL(src, window.location.origin)
    requestUrl.searchParams.set("format", "json")
    fetch(requestUrl.toString(), { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`http_${r.status}`)
        const data = (await r.json()) as {
          sourceUrl?: string
          expiresAt?: string
        }

        if (!data.sourceUrl) throw new Error("missing_source_url")
        if (!cancelled) {
          setResolved({
            src,
            sourceUrl: data.sourceUrl,
            expiresAt: data.expiresAt ?? null,
          })
          setErr(null)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setErr({ src, message: e.message })
        }
      })

    return () => {
      cancelled = true
    }
  }, [src, usesServerPreview])

  const sourceUrl = usesServerPreview
    ? resolved?.src === src
      ? resolved.sourceUrl
      : null
    : directSourceUrl
  const expiresAt =
    usesServerPreview && resolved?.src === src ? resolved.expiresAt : null
  const activeErr = err?.src === src ? err.message : null

  if (activeErr) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-muted-foreground">
        <div>
          <div className="mb-2 text-lg text-foreground">
            Failed to load Office preview
          </div>
          <div className="text-sm text-destructive">{activeErr}</div>
        </div>
      </div>
    )
  }

  if (!sourceUrl) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>
  }

  const viewer = buildOfficeViewerUrl(provider, sourceUrl)
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(
    sourceUrl
  )

  const meta = (
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
            Source URL
          </dt>
          <dd className="rounded bg-background px-3 py-2 font-mono text-xs break-all text-foreground">
            {sourceUrl}
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
        {expiresAt && (
          <div>
            <dt className="mb-1 text-xs font-medium text-muted-foreground">
              Source Expires
            </dt>
            <dd className="rounded bg-background px-3 py-2 text-xs text-foreground">
              {expiresAt}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )

  if (isLocal) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-muted-foreground">
        {meta}
        <div>
          <div className="mb-2 text-lg">Office preview needs a public URL</div>
          <div className="text-sm">
            Google and Office viewers can't reach files served from localhost.
            <br />
            Download to view, or try again on the deployed site.
          </div>
        </div>
      </div>
    )
  }
  return (
    <>
      <iframe
        src={viewer}
        className="h-full w-full border-0"
        title={name}
        allowFullScreen
      />
    </>
  )
}
