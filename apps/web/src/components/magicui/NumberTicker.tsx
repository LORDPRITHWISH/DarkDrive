import { useEffect, useRef, useState } from "react"

// Magic UI's NumberTicker without the `motion` dependency: counts up from the
// previously shown value with an ease-out over `duration` ms. Reduced-motion
// users get the final number immediately.
export default function NumberTicker({
  value,
  duration = 900,
  className,
}: {
  value: number
  duration?: number
  className?: string
}) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const origin = from.current
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration)
      const n = Math.round(origin + (value - origin) * (1 - (1 - t) ** 3))
      from.current = n
      setShown(n)
      if (t < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return <span className={`tabular-nums ${className ?? ""}`}>{shown.toLocaleString()}</span>
}
