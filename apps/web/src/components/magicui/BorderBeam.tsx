import type { CSSProperties } from "react"

// Magic UI's BorderBeam (CSS-only variant): a gradient dot that travels the
// parent's border via offset-path. The parent needs `relative` and a radius.
export default function BorderBeam({
  size = 200,
  duration = 12,
  borderWidth = 1.5,
  colorFrom = "var(--primary)",
  colorTo = "transparent",
}: {
  size?: number
  duration?: number
  borderWidth?: number
  colorFrom?: string
  colorTo?: string
}) {
  return (
    <div
      style={
        {
          "--size": size,
          "--duration": duration,
          "--border-width": borderWidth,
          "--color-from": colorFrom,
          "--color-to": colorTo,
        } as CSSProperties
      }
      className="pointer-events-none absolute inset-0 rounded-[inherit] [border:calc(var(--border-width)*1px)_solid_transparent] mask-[linear-gradient(transparent,transparent),linear-gradient(white,white)] [mask-clip:padding-box,border-box]! [mask-composite:intersect]! after:absolute after:aspect-square after:w-[calc(var(--size)*1px)] after:animate-border-beam after:[background:linear-gradient(to_left,var(--color-from),var(--color-to),transparent)] after:[offset-anchor:90%_50%] after:[offset-path:rect(0_auto_auto_0_round_calc(var(--size)*1px))] motion-reduce:after:animate-none"
    />
  )
}
