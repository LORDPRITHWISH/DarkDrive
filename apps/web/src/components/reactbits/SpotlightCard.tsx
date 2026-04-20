import { useRef, type MouseEvent, type ReactNode } from "react"

interface SpotlightCardProps {
  children: ReactNode
  className?: string
  spotlightColor?: string
}

export default function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgba(255, 255, 255, 0.25)",
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = divRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`)
    el.style.setProperty("--my", `${e.clientY - rect.top}px`)
    el.style.setProperty("--opacity", "0.6")
  }

  const handleMouseLeave = () => {
    divRef.current?.style.setProperty("--opacity", "0")
  }

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden rounded-3xl border bg-card p-8 ${className}`}
      style={
        {
          "--mx": "50%",
          "--my": "50%",
          "--opacity": "0",
          "--spotlight": spotlightColor,
        } as React.CSSProperties
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: "var(--opacity)",
          background:
            "radial-gradient(600px circle at var(--mx) var(--my), var(--spotlight), transparent 45%)",
        }}
      />
      {children}
    </div>
  )
}
