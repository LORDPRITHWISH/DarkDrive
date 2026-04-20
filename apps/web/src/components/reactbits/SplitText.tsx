import { useEffect, useRef, useState } from "react"

interface SplitTextProps {
  text: string
  className?: string
  delay?: number
  duration?: number
  splitType?: "chars" | "words"
  threshold?: number
}

export default function SplitText({
  text,
  className = "",
  delay = 40,
  duration = 600,
  splitType = "chars",
  threshold = 0.1,
}: SplitTextProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const units = splitType === "chars" ? text.split("") : text.split(" ")

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.unobserve(el)
        }
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])

  return (
    <span ref={ref} className={`inline-block ${className}`}>
      {units.map((u, i) => (
        <span
          key={i}
          className="inline-block"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(30px)",
            transition: `opacity ${duration}ms ease, transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`,
            transitionDelay: `${i * delay}ms`,
          }}
        >
          {u === " " ? "\u00A0" : u}
          {splitType === "words" && i < units.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </span>
  )
}
