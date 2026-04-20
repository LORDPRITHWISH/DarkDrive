import { useCallback, useEffect, useRef, type ReactNode } from "react"

interface ClickSparkProps {
  sparkColor?: string
  sparkSize?: number
  sparkRadius?: number
  sparkCount?: number
  duration?: number
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out"
  extraScale?: number
  children?: ReactNode
}

interface Spark {
  x: number
  y: number
  angle: number
  startTime: number
}

export default function ClickSpark({
  sparkColor = "#fff",
  sparkSize = 10,
  sparkRadius = 15,
  sparkCount = 8,
  duration = 400,
  easing = "ease-out",
  extraScale = 1.0,
  children,
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sparksRef = useRef<Spark[]>([])
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    let resizeTimeout: number | undefined
    const resize = () => {
      const { width, height } = parent.getBoundingClientRect()
      canvas.width = width
      canvas.height = height
    }
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimeout)
      resizeTimeout = window.setTimeout(resize, 100)
    })
    ro.observe(parent)
    resize()
    return () => {
      ro.disconnect()
      clearTimeout(resizeTimeout)
    }
  }, [])

  const easeFn = useCallback(
    (t: number) => {
      switch (easing) {
        case "linear":
          return t
        case "ease-in":
          return t * t
        case "ease-in-out":
          return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2
        case "ease-out":
        default:
          return t * (2 - t)
      }
    },
    [easing],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animId: number
    const draw = (ts: number) => {
      if (startTimeRef.current === null) startTimeRef.current = ts
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      sparksRef.current = sparksRef.current.filter((s) => {
        const elapsed = ts - s.startTime
        if (elapsed >= duration) return false
        const p = elapsed / duration
        const eased = easeFn(p)
        const d = eased * sparkRadius * extraScale
        const len = sparkSize * (1 - eased)
        const x1 = s.x + d * Math.cos(s.angle)
        const y1 = s.y + d * Math.sin(s.angle)
        const x2 = s.x + (d + len) * Math.cos(s.angle)
        const y2 = s.y + (d + len) * Math.sin(s.angle)
        ctx.strokeStyle = sparkColor
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        return true
      })
      animId = requestAnimationFrame(draw)
    }
    animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
  }, [sparkColor, sparkSize, sparkRadius, duration, easeFn, extraScale])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const now = performance.now()
    const fresh: Spark[] = Array.from({ length: sparkCount }, (_, i) => ({
      x,
      y,
      angle: (2 * Math.PI * i) / sparkCount,
      startTime: now,
    }))
    sparksRef.current.push(...fresh)
  }

  return (
    <div
      onClick={handleClick}
      className="relative w-full h-full"
      style={{ position: "relative" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none select-none"
      />
      {children}
    </div>
  )
}
