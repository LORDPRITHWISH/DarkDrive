import { useEffect, useRef, useState } from "react"

interface BlurTextProps {
  text: string
  delay?: number
  className?: string
  animateBy?: "words" | "letters"
  direction?: "top" | "bottom"
  threshold?: number
  rootMargin?: string
  onAnimationComplete?: () => void
}

export default function BlurText({
  text = "",
  delay = 200,
  className = "",
  animateBy = "words",
  direction = "top",
  threshold = 0.1,
  rootMargin = "0px",
  onAnimationComplete,
}: BlurTextProps) {
  const elements = animateBy === "words" ? text.split(" ") : text.split("")
  const [inView, setInView] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  const completedRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.unobserve(el)
        }
      },
      { threshold, rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin])

  useEffect(() => {
    if (!inView || completedRef.current) return
    const total = delay * elements.length + 800
    const t = setTimeout(() => {
      completedRef.current = true
      onAnimationComplete?.()
    }, total)
    return () => clearTimeout(t)
  }, [inView, delay, elements.length, onAnimationComplete])

  return (
    <p ref={ref} className={`blur-text flex flex-wrap ${className}`}>
      {elements.map((seg, i) => (
        <span
          key={i}
          className="inline-block will-change-[transform,filter,opacity]"
          style={{
            filter: inView ? "blur(0px)" : "blur(10px)",
            opacity: inView ? 1 : 0,
            transform: inView
              ? "translate3d(0,0,0)"
              : direction === "top"
                ? "translate3d(0,-20px,0)"
                : "translate3d(0,20px,0)",
            transition: `filter 0.6s ease, opacity 0.6s ease, transform 0.6s ease`,
            transitionDelay: `${(i * delay) / 1000}s`,
          }}
        >
          {seg === " " ? "\u00A0" : seg}
          {animateBy === "words" && i < elements.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </p>
  )
}
