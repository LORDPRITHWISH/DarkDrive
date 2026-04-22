import { useEffect, useEffectEvent, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist"
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist"
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url"

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

type PdfReadingMode = "scroll" | "book"
type PdfTheme = "light" | "dark" | "sepia"
type ZoomMode = "fit" | "custom"

type ResolvedSource = {
  sourceUrl: string
  expiresAt: string | null
}

type LoadedPdf = {
  sourceUrl: string
  pdf: PDFDocumentProxy
  pageCount: number
  baseWidth: number
  baseHeight: number
}

const TOOLBAR_BUTTON =
  "rounded-full border px-3 py-1.5 text-xs font-medium transition hover:-translate-y-0.5"
const SEGMENT_BUTTON = "rounded-full px-3 py-1.5 text-xs font-medium transition"
const ZOOM_MIN = 0.6
const ZOOM_MAX = 3.2

const THEME_STYLES: Record<
  PdfTheme,
  {
    shell: string
    toolbar: string
    toolbarBorder: string
    toolbarText: string
    toolbarMuted: string
    toolbarActive: string
    toolbarActiveText: string
    page: string
    pageBorder: string
    pageShadow: string
    pageLabel: string
    canvasFilter: string
    placeholder: string
  }
> = {
  light: {
    shell:
      "linear-gradient(180deg, rgba(244,247,252,1) 0%, rgba(233,238,244,1) 100%)",
    toolbar: "rgba(255,255,255,0.86)",
    toolbarBorder: "rgba(137,152,173,0.25)",
    toolbarText: "#0f172a",
    toolbarMuted: "rgba(15,23,42,0.65)",
    toolbarActive: "#0f172a",
    toolbarActiveText: "#f8fafc",
    page: "#ffffff",
    pageBorder: "rgba(148,163,184,0.25)",
    pageShadow: "0 28px 70px -38px rgba(15, 23, 42, 0.45)",
    pageLabel: "rgba(15,23,42,0.68)",
    canvasFilter: "none",
    placeholder: "rgba(226,232,240,0.85)",
  },
  dark: {
    shell:
      "radial-gradient(circle at top, rgba(30,41,59,0.88) 0%, rgba(8,15,28,1) 62%)",
    toolbar: "rgba(15,23,42,0.72)",
    toolbarBorder: "rgba(148,163,184,0.18)",
    toolbarText: "#e2e8f0",
    toolbarMuted: "rgba(226,232,240,0.7)",
    toolbarActive: "#e2e8f0",
    toolbarActiveText: "#0f172a",
    page: "#111827",
    pageBorder: "rgba(148,163,184,0.16)",
    pageShadow: "0 30px 80px -42px rgba(0, 0, 0, 0.72)",
    pageLabel: "rgba(226,232,240,0.72)",
    canvasFilter:
      "invert(0.92) hue-rotate(180deg) contrast(0.96) brightness(0.96)",
    placeholder: "rgba(30,41,59,0.9)",
  },
  sepia: {
    shell:
      "linear-gradient(180deg, rgba(234,226,208,1) 0%, rgba(217,204,180,1) 100%)",
    toolbar: "rgba(249,241,225,0.82)",
    toolbarBorder: "rgba(120,95,67,0.2)",
    toolbarText: "#5f4630",
    toolbarMuted: "rgba(95,70,48,0.72)",
    toolbarActive: "#8b5e34",
    toolbarActiveText: "#fff7ec",
    page: "#f8eedc",
    pageBorder: "rgba(139,94,52,0.18)",
    pageShadow: "0 26px 70px -40px rgba(107, 79, 52, 0.45)",
    pageLabel: "rgba(95,70,48,0.72)",
    canvasFilter: "sepia(0.55) saturate(0.82) brightness(0.98)",
    placeholder: "rgba(223,209,182,0.9)",
  },
}

export function PdfViewer({
  fileId,
  name,
  src,
  layout = "modal",
  onFocusModeChange,
}: {
  fileId: string
  name: string
  src: string
  layout?: "modal" | "fill"
  onFocusModeChange?: (focused: boolean) => void
}) {
  const [readingMode, setReadingMode] = useState<PdfReadingMode>("scroll")
  const [focusMode, setFocusMode] = useState(false)
  const [theme, setTheme] = useState<PdfTheme>("dark")
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit")
  const [customZoom, setCustomZoom] = useState(1.35)
  const [flipMotion, setFlipMotion] = useState(true)
  const [containerWidth, setContainerWidth] = useState(0)
  const [activeGroupStart, setActiveGroupStart] = useState(1)
  const [resolved, setResolved] = useState<{
    src: string
    data: ResolvedSource | null
    error: string | null
  }>({ src, data: null, error: null })
  const [loaded, setLoaded] = useState<{
    sourceUrl: string | null
    data: LoadedPdf | null
    error: string | null
  }>({ sourceUrl: null, data: null, error: null })
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const groupRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const zoomStorageKey = `darkdrive:pdf-zoom:${fileId}`
  const themeStyle = THEME_STYLES[theme]

  useEffect(() => {
    const stored = window.localStorage.getItem(zoomStorageKey)
    const parsed = stored ? Number(stored) : NaN
    setCustomZoom(
      Number.isFinite(parsed) ? clamp(parsed, ZOOM_MIN, ZOOM_MAX) : 1.35
    )
    setZoomMode("fit")
    setReadingMode("scroll")
    setFocusMode(false)
    setActiveGroupStart(1)
    setFlipMotion(true)
  }, [zoomStorageKey])

  useEffect(() => {
    onFocusModeChange?.(focusMode)
  }, [focusMode, onFocusModeChange])

  useEffect(() => {
    return () => onFocusModeChange?.(false)
  }, [onFocusModeChange])

  useEffect(() => {
    if (zoomMode !== "custom") return
    window.localStorage.setItem(zoomStorageKey, String(customZoom))
  }, [customZoom, zoomMode, zoomStorageKey])

  useEffect(() => {
    let cancelled = false
    const full = new URL(src, window.location.origin)
    const usesServerPreview = /^\/api\/files\/[^/]+\/preview$/.test(
      full.pathname
    )

    setResolved({ src, data: null, error: null })

    if (!usesServerPreview) {
      setResolved({
        src,
        data: { sourceUrl: full.toString(), expiresAt: null },
        error: null,
      })
      return () => {
        cancelled = true
      }
    }

    full.searchParams.set("format", "json")
    fetch(full.toString(), { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`http_${response.status}`)
        const data = (await response.json()) as Partial<ResolvedSource>
        if (!data.sourceUrl) throw new Error("missing_source_url")
        if (!cancelled) {
          setResolved({
            src,
            data: {
              sourceUrl: data.sourceUrl,
              expiresAt: data.expiresAt ?? null,
            },
            error: null,
          })
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setResolved({ src, data: null, error: error.message })
        }
      })

    return () => {
      cancelled = true
    }
  }, [src])

  const sourceUrl =
    resolved.src === src ? (resolved.data?.sourceUrl ?? null) : null
  const sourceExpiresAt =
    resolved.src === src ? (resolved.data?.expiresAt ?? null) : null

  useEffect(() => {
    if (!sourceUrl) return

    let cancelled = false
    let activePdf: PDFDocumentProxy | null = null
    const loadingTask = getDocument({ url: sourceUrl })

    setLoaded({ sourceUrl, data: null, error: null })

    loadingTask.promise
      .then(async (pdf) => {
        activePdf = pdf
        const firstPage = await pdf.getPage(1)
        const firstViewport = firstPage.getViewport({ scale: 1 })
        if (!cancelled) {
          setLoaded({
            sourceUrl,
            data: {
              sourceUrl,
              pdf,
              pageCount: pdf.numPages,
              baseWidth: firstViewport.width,
              baseHeight: firstViewport.height,
            },
            error: null,
          })
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setLoaded({ sourceUrl, data: null, error: error.message })
        }
      })

    return () => {
      cancelled = true
      void loadingTask.destroy()
      void activePdf?.destroy()
    }
  }, [sourceUrl])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setContainerWidth(entry.contentRect.width)
    })
    observer.observe(container)
    setContainerWidth(container.clientWidth)
    return () => observer.disconnect()
  }, [layout, focusMode])

  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return

    if (event.key === "f" || event.key === "F") {
      event.preventDefault()
      setFocusMode((current) => !current)
      return
    }
    if (event.key === "b" || event.key === "B") {
      event.preventDefault()
      setFocusMode(false)
      setReadingMode("book")
      return
    }
    if (event.key === "s" || event.key === "S") {
      event.preventDefault()
      setFocusMode(false)
      setReadingMode("scroll")
      return
    }
    if (event.key === "0") {
      event.preventDefault()
      setZoomMode("fit")
      return
    }
    if (event.key === "+" || (event.key === "=" && event.shiftKey)) {
      event.preventDefault()
      adjustZoom(0.18)
      return
    }
    if (event.key === "-") {
      event.preventDefault()
      adjustZoom(-0.18)
    }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleShortcut(event)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const pageCount = loaded.data?.pageCount ?? 0
  const baseWidth = loaded.data?.baseWidth ?? 900
  const baseHeight = loaded.data?.baseHeight ?? 1260
  const spreadColumns = readingMode === "book" && containerWidth >= 940 ? 2 : 1
  const horizontalPadding = layout === "fill" || focusMode ? 56 : 72
  const usableWidth = Math.max(320, containerWidth - horizontalPadding)
  const fitScale =
    readingMode === "book" && spreadColumns === 2
      ? clamp((usableWidth - 28) / (baseWidth * 2), 0.45, 2.4)
      : clamp(usableWidth / baseWidth, 0.45, 2.4)
  const scale = zoomMode === "fit" ? fitScale : customZoom
  const estimatedWidth = Math.max(180, baseWidth * scale)
  const estimatedHeight = Math.max(220, baseHeight * scale)

  const pageGroups = buildPageGroups(pageCount, readingMode)
  const activeGroup =
    pageGroups.find((group) => group[0] === activeGroupStart) ??
    pageGroups[0] ??
    null
  const pageLabel = activeGroup
    ? activeGroup.length === 2
      ? `${activeGroup[0]}-${activeGroup[1]} / ${pageCount}`
      : `${activeGroup[0]} / ${pageCount}`
    : "—"

  useEffect(() => {
    const root = scrollRef.current
    if (!root || pageGroups.length === 0) return

    let frame = 0
    const updateActiveGroup = () => {
      frame = 0
      const centerY =
        root.getBoundingClientRect().top + root.clientHeight * 0.26
      let closest = pageGroups[0][0]
      let distance = Number.POSITIVE_INFINITY

      for (const group of pageGroups) {
        const element = groupRefs.current[group[0]]
        if (!element) continue
        const nextDistance = Math.abs(
          element.getBoundingClientRect().top - centerY
        )
        if (nextDistance < distance) {
          closest = group[0]
          distance = nextDistance
        }
      }

      setActiveGroupStart(closest)
    }

    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(updateActiveGroup)
    }

    schedule()
    root.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)

    return () => {
      root.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [pageGroups, scale])

  function setManualZoom(next: number) {
    const clamped = clamp(next, ZOOM_MIN, ZOOM_MAX)
    setZoomMode("custom")
    setCustomZoom(clamped)
  }

  function adjustZoom(delta: number) {
    const baseline = zoomMode === "fit" ? fitScale : customZoom
    setManualZoom(baseline + delta)
  }

  function toggleDoubleZoom() {
    if (zoomMode === "fit") {
      setManualZoom(Math.max(customZoom, Math.min(ZOOM_MAX, fitScale * 1.7)))
      return
    }
    setZoomMode("fit")
  }

  function scrollToStep(direction: -1 | 1) {
    if (!activeGroup || pageGroups.length === 0) return
    const currentIndex = pageGroups.findIndex(
      (group) => group[0] === activeGroup[0]
    )
    const nextIndex = clamp(currentIndex + direction, 0, pageGroups.length - 1)
    const nextGroup = pageGroups[nextIndex]
    if (!nextGroup) return
    groupRefs.current[nextGroup[0]]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  if (resolved.error) {
    return (
      <PdfStatusCard
        title="Failed to load PDF preview"
        body={resolved.error}
        theme={themeStyle}
      />
    )
  }

  if (!sourceUrl) {
    return (
      <PdfStatusCard
        title="Preparing PDF"
        body="Resolving source…"
        theme={themeStyle}
      />
    )
  }

  if (loaded.error) {
    return (
      <PdfStatusCard
        title="Failed to load PDF"
        body={loaded.error}
        theme={themeStyle}
      />
    )
  }

  if (!loaded.data || loaded.sourceUrl !== sourceUrl) {
    return (
      <PdfStatusCard
        title="Loading PDF"
        body="Rendering pages…"
        theme={themeStyle}
      />
    )
  }

  const pdfDocument = loaded.data.pdf

  return (
    <div
      className="relative flex h-full w-full min-w-0 flex-col overflow-hidden"
      title={name}
      style={{
        background: themeStyle.shell,
        color: themeStyle.toolbarText,
        transition: "background 220ms ease, color 220ms ease",
      }}
    >
      {focusMode ? (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center">
          <div
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-lg backdrop-blur-md transition-opacity duration-200"
            style={{
              background: themeStyle.toolbar,
              borderColor: themeStyle.toolbarBorder,
              color: themeStyle.toolbarText,
            }}
          >
            <button
              type="button"
              className={SEGMENT_BUTTON}
              style={{
                background: themeStyle.toolbarActive,
                color: themeStyle.toolbarActiveText,
              }}
              onClick={() => setFocusMode(false)}
            >
              Exit focus
            </button>
            <span style={{ color: themeStyle.toolbarMuted }}>{pageLabel}</span>
          </div>
        </div>
      ) : (
        <div className="absolute inset-x-4 top-4 z-30">
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border px-4 py-3 shadow-xl backdrop-blur-md"
            style={{
              background: themeStyle.toolbar,
              borderColor: themeStyle.toolbarBorder,
              color: themeStyle.toolbarText,
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Segment
                label="Scroll"
                active={readingMode === "scroll"}
                onClick={() => {
                  setFocusMode(false)
                  setReadingMode("scroll")
                }}
                theme={themeStyle}
              />
              <Segment
                label="Book"
                active={readingMode === "book"}
                onClick={() => {
                  setFocusMode(false)
                  setReadingMode("book")
                }}
                theme={themeStyle}
              />
              <Segment
                label="Focus"
                active={focusMode}
                onClick={() => setFocusMode((current) => !current)}
                theme={themeStyle}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-xs"
                style={{ color: themeStyle.toolbarMuted }}
              >
                {pageLabel}
              </span>
              <button
                type="button"
                className={TOOLBAR_BUTTON}
                style={buttonStyle(themeStyle)}
                onClick={() => scrollToStep(-1)}
              >
                Prev
              </button>
              <button
                type="button"
                className={TOOLBAR_BUTTON}
                style={buttonStyle(themeStyle)}
                onClick={() => scrollToStep(1)}
              >
                Next
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Segment
                label="Light"
                active={theme === "light"}
                onClick={() => setTheme("light")}
                theme={themeStyle}
              />
              <Segment
                label="Dark"
                active={theme === "dark"}
                onClick={() => setTheme("dark")}
                theme={themeStyle}
              />
              <Segment
                label="Sepia"
                active={theme === "sepia"}
                onClick={() => setTheme("sepia")}
                theme={themeStyle}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={TOOLBAR_BUTTON}
                style={buttonStyle(themeStyle, zoomMode === "fit")}
                onClick={() => setZoomMode("fit")}
              >
                Fit width
              </button>
              <button
                type="button"
                className={TOOLBAR_BUTTON}
                style={buttonStyle(themeStyle)}
                onClick={() => adjustZoom(-0.18)}
              >
                Zoom -
              </button>
              <button
                type="button"
                className={TOOLBAR_BUTTON}
                style={buttonStyle(themeStyle)}
                onClick={() => adjustZoom(0.18)}
              >
                Zoom +
              </button>
              <span
                className="text-xs"
                style={{ color: themeStyle.toolbarMuted }}
              >
                {Math.round(scale * 100)}%
              </span>
              {readingMode === "book" && (
                <button
                  type="button"
                  className={TOOLBAR_BUTTON}
                  style={buttonStyle(themeStyle, flipMotion)}
                  onClick={() => setFlipMotion((current) => !current)}
                >
                  Flip motion
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto scroll-smooth"
        style={{
          paddingTop: focusMode ? 28 : 92,
          paddingBottom: layout === "fill" ? 28 : 36,
          paddingLeft: layout === "fill" ? 20 : 24,
          paddingRight: layout === "fill" ? 20 : 24,
        }}
      >
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-7">
          {pageGroups.map((group) => (
            <div
              key={group[0]}
              ref={(node) => {
                groupRefs.current[group[0]] = node
              }}
              className={`mx-auto grid w-full justify-center gap-7 ${
                readingMode === "book" && spreadColumns === 2
                  ? "grid-cols-2"
                  : "grid-cols-1"
              }`}
            >
              {group.map((pageNumber, index) => (
                <PdfPageCanvas
                  key={pageNumber}
                  pdf={pdfDocument}
                  pageNumber={pageNumber}
                  scale={scale}
                  scrollRootRef={scrollRef}
                  estimatedWidth={estimatedWidth}
                  estimatedHeight={estimatedHeight}
                  onDoubleClick={toggleDoubleZoom}
                  filter={themeStyle.canvasFilter}
                  pageTone={themeStyle.page}
                  pageBorder={themeStyle.pageBorder}
                  pageShadow={themeStyle.pageShadow}
                  pageLabel={themeStyle.pageLabel}
                  placeholder={themeStyle.placeholder}
                  flipMotion={flipMotion && readingMode === "book"}
                  flipSide={
                    readingMode === "book" && spreadColumns === 2
                      ? index === 0
                        ? "left"
                        : "right"
                      : "left"
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {sourceExpiresAt && !focusMode && (
        <div className="pointer-events-none absolute right-4 bottom-3 z-20">
          <div
            className="rounded-full border px-3 py-1 text-[11px] shadow-sm backdrop-blur-sm"
            style={{
              background: themeStyle.toolbar,
              borderColor: themeStyle.toolbarBorder,
              color: themeStyle.toolbarMuted,
            }}
          >
            Signed preview until{" "}
            {new Date(sourceExpiresAt).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  )
}

function PdfPageCanvas({
  pdf,
  pageNumber,
  scale,
  estimatedWidth,
  estimatedHeight,
  scrollRootRef,
  onDoubleClick,
  filter,
  pageTone,
  pageBorder,
  pageShadow,
  pageLabel,
  placeholder,
  flipMotion,
  flipSide,
}: {
  pdf: PDFDocumentProxy
  pageNumber: number
  scale: number
  estimatedWidth: number
  estimatedHeight: number
  scrollRootRef: React.RefObject<HTMLDivElement | null>
  onDoubleClick: () => void
  filter: string
  pageTone: string
  pageBorder: string
  pageShadow: string
  pageLabel: string
  placeholder: string
  flipMotion: boolean
  flipSide: "left" | "right"
}) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [shouldRender, setShouldRender] = useState(pageNumber <= 2)
  const [renderedSize, setRenderedSize] = useState<{
    width: number
    height: number
  } | null>(null)

  useEffect(() => {
    const root = scrollRootRef.current
    const shell = shellRef.current
    if (!root || !shell || shouldRender) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRender(true)
          observer.disconnect()
        }
      },
      { root, rootMargin: "1200px 0px" }
    )

    observer.observe(shell)
    return () => observer.disconnect()
  }, [scrollRootRef, shouldRender])

  useEffect(() => {
    if (!shouldRender) return

    let cancelled = false
    let renderTask: RenderTask | null = null

    pdf
      .getPage(pageNumber)
      .then(async (page) => {
        if (cancelled) return
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        if (!canvas) return
        const context = canvas.getContext("2d", { alpha: false })
        if (!context) return

        const deviceScale = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * deviceScale)
        canvas.height = Math.floor(viewport.height * deviceScale)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0)

        setRenderedSize({ width: viewport.width, height: viewport.height })

        renderTask = page.render({ canvas, canvasContext: context, viewport })
        await renderTask.promise
      })
      .catch((error: Error) => {
        if (error.name !== "RenderingCancelledException" && !cancelled) {
          setRenderedSize({
            width: estimatedWidth,
            height: estimatedHeight,
          })
        }
      })

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [estimatedHeight, estimatedWidth, pageNumber, pdf, scale, shouldRender])

  const width = renderedSize?.width ?? estimatedWidth
  const height = renderedSize?.height ?? estimatedHeight

  return (
    <div
      ref={shellRef}
      className={`relative mx-auto overflow-hidden rounded-[26px] border transition-[transform,box-shadow] duration-300 ${
        flipMotion
          ? flipSide === "left"
            ? "animate-pdf-page-flip-left"
            : "animate-pdf-page-flip-right"
          : ""
      }`}
      style={{
        width,
        minHeight: height,
        background: pageTone,
        borderColor: pageBorder,
        boxShadow: pageShadow,
        transformOrigin: flipSide === "left" ? "left center" : "right center",
      }}
      onDoubleClick={onDoubleClick}
    >
      {shouldRender ? (
        <canvas
          ref={canvasRef}
          className="block max-w-none"
          style={{ filter }}
        />
      ) : (
        <div
          className="w-full animate-pulse"
          style={{
            height,
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04))",
          }}
        />
      )}

      <div
        className="pointer-events-none absolute right-3 bottom-3 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm"
        style={{
          background: placeholder,
          color: pageLabel,
        }}
      >
        Page {pageNumber}
      </div>
    </div>
  )
}

function PdfStatusCard({
  title,
  body,
  theme,
}: {
  title: string
  body: string
  theme: (typeof THEME_STYLES)[PdfTheme]
}) {
  return (
    <div
      className="grid h-full w-full place-items-center p-8 text-center"
      style={{
        background: theme.shell,
        color: theme.toolbarText,
      }}
    >
      <div
        className="max-w-md rounded-[28px] border px-6 py-5 shadow-xl backdrop-blur-md"
        style={{
          background: theme.toolbar,
          borderColor: theme.toolbarBorder,
        }}
      >
        <div className="mb-2 text-lg font-semibold">{title}</div>
        <div style={{ color: theme.toolbarMuted }}>{body}</div>
      </div>
    </div>
  )
}

function Segment({
  label,
  active,
  onClick,
  theme,
}: {
  label: string
  active: boolean
  onClick: () => void
  theme: (typeof THEME_STYLES)[PdfTheme]
}) {
  return (
    <button
      type="button"
      className={SEGMENT_BUTTON}
      style={{
        background: active ? theme.toolbarActive : "transparent",
        color: active ? theme.toolbarActiveText : theme.toolbarText,
      }}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}

function buttonStyle(
  theme: (typeof THEME_STYLES)[PdfTheme],
  active = false
): CSSProperties {
  return {
    background: active ? theme.toolbarActive : "transparent",
    borderColor: theme.toolbarBorder,
    color: active ? theme.toolbarActiveText : theme.toolbarText,
  }
}

function buildPageGroups(pageCount: number, readingMode: PdfReadingMode) {
  const groups: number[][] = []

  if (readingMode === "book") {
    for (let page = 1; page <= pageCount; page += 2) {
      const group = [page]
      if (page + 1 <= pageCount) group.push(page + 1)
      groups.push(group)
    }
    return groups
  }

  for (let page = 1; page <= pageCount; page++) {
    groups.push([page])
  }
  return groups
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
