import { useEffect, useEffectEvent, useRef, useState } from "react"
import { MinusIcon, PlusIcon } from "@phosphor-icons/react"

const MAX_ZOOM = 8
// Buttons and keys move in steps; the wheel and a pinch move continuously.
const STEP = 1.5

const ZOOM_BUTTON = "rounded-full p-2 hover:bg-white/15 disabled:pointer-events-none disabled:opacity-40"

// How the image sits on its stage: scale (1 = fitted) and offset from the
// centre in CSS pixels. `smooth` eases a stepped change; a drag or a pinch has
// to track the finger, so those turn it off.
type View = { s: number; x: number; y: number; smooth: boolean }
const FIT: View = { s: 1, x: 0, y: 0, smooth: true }

// Zoom to `s` holding the point (px, py), measured from the stage's centre,
// still on screen where it was — then keep the image from drifting off the
// stage. With `s` unchanged this is just the clamp, which is how a pan uses it.
function place(v: View, s: number, px: number, py: number, smooth: boolean, box: HTMLElement, img: HTMLElement): View {
  s = Math.min(MAX_ZOOM, Math.max(1, s))
  const k = s / v.s
  // offsetWidth is the fitted size: transforms don't change it.
  const mx = Math.max(0, (img.offsetWidth * s - box.clientWidth) / 2)
  const my = Math.max(0, (img.offsetHeight * s - box.clientHeight) / 2)
  return {
    s,
    x: Math.min(mx, Math.max(-mx, px - (px - v.x) * k)),
    y: Math.min(my, Math.max(-my, py - (py - v.y) * k)),
    smooth,
  }
}

/**
 * An image you can zoom into: wheel or trackpad pinch, two fingers, a double
 * click or tap, the buttons, or + / − / 0. Drag to move around once zoomed.
 * `fill` takes the whole of the parent as its stage; otherwise the stage is
 * the image's own fitted box.
 */
export function ZoomableImage({
  src,
  alt,
  fill,
  className,
}: {
  src: string
  alt: string
  fill: boolean
  className: string
}) {
  const [view, setView] = useState(FIT)
  const boxRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  // The fingers, or the mouse button, that are down right now.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const press = useRef({ x: 0, y: 0, moved: false })
  const lastTap = useRef({ t: 0, x: 0, y: 0 })
  const noSwipe = useRef(false)

  const fromCentre = (clientX: number, clientY: number) => {
    const r = boxRef.current!.getBoundingClientRect()
    return [clientX - r.left - r.width / 2, clientY - r.top - r.height / 2] as const
  }
  const zoom = (to: (v: View) => number, px = 0, py = 0, smooth = true) =>
    setView((v) => place(v, to(v), px, py, smooth, boxRef.current!, imgRef.current!))

  const onWheel = useEffectEvent((e: WheelEvent) => {
    e.preventDefault()
    // Some mice report lines, not pixels.
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
    const [px, py] = fromCentre(e.clientX, e.clientY)
    // A trackpad pinch is a ctrl+wheel with much smaller steps.
    zoom((v) => v.s * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)), px, py, false)
  })
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    // Ctrl/⌘ with these is the browser's own zoom: leave it alone.
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]")) return
    if (e.key === "+" || e.key === "=") zoom((v) => v.s * STEP)
    else if (e.key === "-" || e.key === "_") zoom((v) => v.s / STEP)
    else if (e.key === "0") setView(FIT)
  })
  useEffect(() => {
    const box = boxRef.current!
    const wheel = (e: WheelEvent) => onWheel(e)
    const key = (e: KeyboardEvent) => onKey(e)
    // Native rather than onWheel: React's listener is passive, and unless this
    // one cancels the event a trackpad pinch zooms the whole page instead.
    box.addEventListener("wheel", wheel, { passive: false })
    window.addEventListener("keydown", key)
    return () => {
      box.removeEventListener("wheel", wheel)
      window.removeEventListener("keydown", key)
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    // Captured, so a drag that leaves the stage keeps panning.
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // A second finger makes it a pinch, never a tap.
    press.current = { x: e.clientX, y: e.clientY, moved: pointers.current.size > 1 }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const was = pointers.current.get(e.pointerId)
    if (!was) return
    const now = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, now)
    if (Math.hypot(now.x - press.current.x, now.y - press.current.y) > 6) press.current.moved = true
    const other = [...pointers.current].find(([id]) => id !== e.pointerId)?.[1]
    if (other) {
      // Pinch: the gap between two fingers sets the zoom, about their midpoint.
      const gap = Math.hypot(was.x - other.x, was.y - other.y) || 1
      const ratio = Math.hypot(now.x - other.x, now.y - other.y) / gap
      const [px, py] = fromCentre((now.x + other.x) / 2, (now.y + other.y) / 2)
      zoom((v) => v.s * ratio, px, py, false)
    } else {
      // Drag: pan, once there is something to pan.
      setView((v) =>
        v.s === 1
          ? v
          : place({ ...v, x: v.x + now.x - was.x, y: v.y + now.y - was.y }, v.s, 0, 0, false, boxRef.current!, imgRef.current!)
      )
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return
    if (press.current.moved || pointers.current.size) return
    // Two taps on one spot: zoom in there, or back out to fit. Counted by hand
    // because not every phone browser turns a double tap into `dblclick`.
    const tap = { t: e.timeStamp, x: e.clientX, y: e.clientY }
    const last = lastTap.current
    if (tap.t - last.t < 300 && Math.hypot(tap.x - last.x, tap.y - last.y) < 30) {
      lastTap.current = { t: 0, x: 0, y: 0 }
      const [px, py] = fromCentre(tap.x, tap.y)
      setView((v) => (v.s > 1 ? FIT : place(v, 2.5, px, py, true, boxRef.current!, imgRef.current!)))
    } else {
      lastTap.current = tap
    }
  }

  const zoomed = view.s > 1
  return (
    <div
      ref={boxRef}
      // touch-none: the browser would otherwise claim the gesture for its own
      // scrolling and stop sending pointer moves.
      className={`relative flex touch-none items-center justify-center overflow-hidden select-none ${
        fill ? "h-full w-full" : "min-h-48 min-w-64"
      } ${zoomed ? "cursor-grab active:cursor-grabbing" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // The preview pages on a sideways swipe. While zoomed, or mid-pinch, a
      // swipe means "move the picture", so it must not reach that handler.
      onTouchStart={(e) => {
        if (zoomed || e.touches.length > 1) noSwipe.current = true
        if (noSwipe.current) e.stopPropagation()
      }}
      onTouchEnd={(e) => {
        if (noSwipe.current) e.stopPropagation()
        if (e.touches.length === 0) noSwipe.current = false
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        className={`${className} ${
          view.smooth ? "transition-transform duration-150 motion-reduce:transition-none" : ""
        }`}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
      />
      {/* Faint until pointed at. Kept out of the gesture handlers above, which
          would capture the pointer and swallow the click. */}
      <div
        className="absolute right-[calc(env(safe-area-inset-right)+0.5rem)] bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] flex cursor-default items-center rounded-full bg-black/60 text-white opacity-40 backdrop-blur-sm transition-opacity focus-within:opacity-100 hover:opacity-100"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className={ZOOM_BUTTON}
          disabled={!zoomed}
          onClick={() => zoom((v) => v.s / STEP)}
          aria-label="Zoom out"
          title="Zoom out (−)"
        >
          <MinusIcon size={16} />
        </button>
        <button
          className="min-w-11 px-1 text-xs tabular-nums"
          onClick={() => setView(FIT)}
          aria-label="Fit to window"
          title="Fit to window (0)"
        >
          {Math.round(view.s * 100)}%
        </button>
        <button
          className={ZOOM_BUTTON}
          disabled={view.s >= MAX_ZOOM}
          onClick={() => zoom((v) => v.s * STEP)}
          aria-label="Zoom in"
          title="Zoom in (+)"
        >
          <PlusIcon size={16} />
        </button>
      </div>
    </div>
  )
}
