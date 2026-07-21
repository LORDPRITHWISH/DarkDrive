import { Suspense, lazy, useCallback, useEffect, useEffectEvent, useRef, useState } from "react"
import { XIcon, DownloadIcon, InfoIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react"
import type { FileItem, SubtitleTrack } from "@/lib/types"
import { apiUrl } from "@/lib/config"
import { apiGet } from "@/lib/api"
import { formatBytes, formatDate } from "@/lib/format"
import { DarkPlayer } from "./player"
import { AudioPlayer } from "@/components/AudioPlayer"

const LazyPdfViewer = lazy(async () => {
  const module = await import("@/components/PdfViewer")
  return { default: module.PdfViewer }
})

export function FilePreview({
  file,
  onClose,
  items,
  onNavigate,
}: {
  file: FileItem | null
  onClose: () => void
  items?: FileItem[]
  onNavigate?: (file: FileItem) => void
}) {
  const [officeProviderState, setOfficeProviderState] = useState<{
    fileId: string | null
    provider: OfficeProvider
  }>({ fileId: null, provider: "office" })
  const [pdfFocusState, setPdfFocusState] = useState<{
    fileId: string | null
    focused: boolean
  }>({ fileId: null, focused: false })
  const [showInfo, setShowInfo] = useState(false)
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 767px)").matches
  )
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null)

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)")
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])

  useEffect(() => {
    setShowInfo(false)
  }, [file?.id])

  const handleKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (!file) return

    if (e.key === "ArrowLeft" && items && onNavigate) {
      const idx = items.findIndex((f) => f.id === file.id)
      if (idx > 0) {
        e.preventDefault()
        onNavigate(items[idx - 1])
      }
      return
    }
    if (e.key === "ArrowRight" && items && onNavigate) {
      const idx = items.findIndex((f) => f.id === file.id)
      if (idx >= 0 && idx < items.length - 1) {
        e.preventDefault()
        onNavigate(items[idx + 1])
      }
      return
    }

    if (e.key !== "Escape") return

    if (showInfo) {
      e.preventDefault()
      setShowInfo(false)
      return
    }

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
    const onKey = (event: KeyboardEvent) => handleKeyDown(event)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [file])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() }
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchRef.current || !items || !onNavigate || !file) return
      const t = e.changedTouches[0]
      const dx = t.clientX - touchRef.current.x
      const dy = t.clientY - touchRef.current.y
      const dt = Date.now() - touchRef.current.t
      touchRef.current = null
      if (dt > 400 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5)
        return
      const idx = items.findIndex((f) => f.id === file.id)
      if (dx > 0 && idx > 0) onNavigate(items[idx - 1])
      else if (dx < 0 && idx >= 0 && idx < items.length - 1)
        onNavigate(items[idx + 1])
    },
    [items, onNavigate, file]
  )

  if (!file) return null

  const officeFile = isOfficeFile(file.mimeType, file.name)
  const pdfFile = isPdfFile(file.mimeType, file.name)
  const pdfFocusMode =
    !isMobile &&
    pdfFile &&
    pdfFocusState.fileId === file.id &&
    pdfFocusState.focused
  const officeProvider =
    officeFile && officeProviderState.fileId === file.id
      ? officeProviderState.provider
      : "office"
  const inlineSrc = apiUrl(`/api/files/${file.id}/download?inline=1`)
  const viewSrc =
    officeFile || pdfFile
      ? apiUrl(`/api/files/${file.id}/preview`)
      : inlineSrc
  const dlHref = apiUrl(`/api/files/${file.id}/download`)
  const viewerLayout: FileViewerLayout =
    isMobile || pdfFocusMode ? "fill" : "modal"

  const currentIndex = items
    ? items.findIndex((f) => f.id === file.id)
    : -1
  const hasPrev = currentIndex > 0
  const hasNext = items ? currentIndex < items.length - 1 : false
  const goPrev = () => {
    if (hasPrev && items && onNavigate) onNavigate(items[currentIndex - 1])
  }
  const goNext = () => {
    if (hasNext && items && onNavigate) onNavigate(items[currentIndex + 1])
  }
  const counter =
    items && items.length > 1 && currentIndex >= 0
      ? `${currentIndex + 1} / ${items.length}`
      : null

  const handleOfficeProviderChange = (provider: OfficeProvider) => {
    setOfficeProviderState({ fileId: file.id, provider })
  }

  const handlePdfFocusModeChange = (focused: boolean) => {
    setPdfFocusState({ fileId: file.id, focused })
  }

  const propertiesContent = (
    <>
      <a
        href={dlHref}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <DownloadIcon size={14} /> Download
      </a>
      {officeFile && (
        <div className="mt-3 border-t pt-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Preview Provider
          </div>
          <OfficeProviderSwitch
            provider={officeProvider}
            onChange={handleOfficeProviderChange}
          />
        </div>
      )}
      <div className="mt-3 border-t pt-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Properties
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
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
              <span className="break-all font-mono text-xs">{file.id}</span>
            }
          />
          <Info
            label="Folder"
            value={
              <span className="break-all font-mono text-xs">
                {file.folderId}
              </span>
            }
          />
          {file.spaceId && (
            <Info
              label="Space"
              value={
                <span className="break-all font-mono text-xs">
                  {file.spaceId}
                </span>
              }
            />
          )}
          <Info
            label="Key"
            value={
              <span className="break-all font-mono text-xs">
                {file.storageKey}
              </span>
            }
          />
        </dl>
      </div>
    </>
  )

  /* ── Mobile layout ── */
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <div className="flex shrink-0 items-center gap-1 border-b px-2 py-2">
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-muted-foreground active:bg-accent"
            aria-label="Close"
          >
            <XIcon size={20} />
          </button>
          <h3 className="min-w-0 flex-1 truncate px-1 text-sm font-medium">
            {file.name}
          </h3>
          {counter && (
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs tabular-nums text-muted-foreground">
              {counter}
            </span>
          )}
          <button
            onClick={() => setShowInfo(true)}
            className="shrink-0 rounded-lg p-2 text-muted-foreground active:bg-accent"
            aria-label="File info"
          >
            <InfoIcon size={20} />
          </button>
          <a
            href={dlHref}
            className="shrink-0 rounded-lg p-2 text-muted-foreground active:bg-accent"
            aria-label="Download"
          >
            <DownloadIcon size={20} />
          </a>
        </div>

        <div
          className="flex flex-1 items-center justify-center overflow-hidden bg-muted"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <FileViewer
            file={file}
            src={viewSrc}
            layout="fill"
            officeProvider={officeProvider}
            subtitleFileId={file.id}
          />
        </div>

        {showInfo && (
          <>
            <div
              className="fixed inset-0 z-60 bg-black/40"
              onClick={() => setShowInfo(false)}
            />
            <div className="animate-in slide-in-from-bottom fixed inset-x-0 bottom-0 z-70 max-h-[75vh] overflow-auto rounded-t-2xl border-t bg-card px-5 pb-8 pt-3 duration-200">
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3
                  className="min-w-0 truncate font-semibold"
                  title={file.name}
                >
                  {file.name}
                </h3>
                <button
                  onClick={() => setShowInfo(false)}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
                  aria-label="Close details"
                >
                  <XIcon size={18} />
                </button>
              </div>
              {propertiesContent}
            </div>
          </>
        )}
      </div>
    )
  }

  /* ── Desktop layout ── */
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className={`flex overflow-hidden rounded-lg border bg-background transition-[width,height,max-width,max-height] duration-300 ${
          pdfFocusMode
            ? "h-[94vh] w-[96vw]"
            : "max-h-[90vh] max-w-[95vw]"
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
            layout={viewerLayout}
            officeProvider={officeProvider}
            onPdfFocusModeChange={handlePdfFocusModeChange}
            subtitleFileId={file.id}
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
            {propertiesContent}
          </aside>
        )}
      </div>

      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
          aria-label="Previous file"
        >
          <CaretLeftIcon size={24} weight="bold" />
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext() }}
          className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
          aria-label="Next file"
        >
          <CaretRightIcon size={24} weight="bold" />
        </button>
      )}
      {counter && (
        <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-3.5 py-1 text-xs tabular-nums text-white backdrop-blur-sm">
          {counter}
        </div>
      )}
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
  subtitleFileId,
}: {
  file: FileItem
  src: string
  layout?: FileViewerLayout
  officeProvider?: OfficeProvider
  onPdfFocusModeChange?: (focused: boolean) => void
  // When set, the video player loads sidecar subtitle tracks for this file id
  // from the authenticated API. Omitted on public surfaces (e.g. share pages).
  subtitleFileId?: string | null
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
      <VideoPreview
        key={src}
        src={src}
        subtitleFileId={subtitleFileId}
        className={`block bg-black ${sizing.h} ${sizing.w} ${
          layout === "fill" ? "h-full w-full" : "w-[90vw] aspect-video"
        }`}
      />
    )
  }
  if (mime.startsWith("audio/")) {
    return (
      <AudioPlayer src={src} name={file.name} />
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

// Wraps the player and, when a file id is supplied, loads sidecar subtitle
// tracks for it. Keyed by the resolved video src so switching files gives the
// underlying player a clean slate (track/audio selection doesn't leak across).
function VideoPreview({
  src,
  subtitleFileId,
  className,
}: {
  src: string
  subtitleFileId?: string | null
  className?: string
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [tracks, setTracks] = useState<SubtitleTrack[]>([])

  useEffect(() => {
    const handler = () => {
      const el = wrapperRef.current
      if (!el) return
      if (
        document.fullscreenElement &&
        el.contains(document.fullscreenElement)
      ) {
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (o: string) => Promise<void>
          unlock?: () => void
        }
        orientation?.lock?.("landscape").catch(() => {})
      } else if (!document.fullscreenElement) {
        try {
          const orientation = screen.orientation as ScreenOrientation & {
            unlock?: () => void
          }
          orientation?.unlock?.()
        } catch {}
      }
    }
    document.addEventListener("fullscreenchange", handler)
    return () => {
      document.removeEventListener("fullscreenchange", handler)
      try {
        screen.orientation?.unlock?.()
      } catch {}
    }
  }, [])

  useEffect(() => {
    if (!subtitleFileId) return
    let cancelled = false
    apiGet<{ tracks: SubtitleTrack[] }>(
      `/api/files/${subtitleFileId}/subtitles`
    )
      .then((data) => {
        if (cancelled) return
        setTracks(data.tracks.map((t) => ({ ...t, src: apiUrl(t.src) })))
      })
      .catch(() => {
        if (!cancelled) setTracks([])
      })
    return () => {
      cancelled = true
    }
  }, [subtitleFileId])

  return (
    <div ref={wrapperRef} className={className}>
      <DarkPlayer src={src} tracks={tracks} className="h-full w-full" />
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
