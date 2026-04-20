import type { ElementType, ReactNode, CSSProperties } from "react"

type StarBorderProps<T extends ElementType> = {
  as?: T
  className?: string
  innerClassName?: string
  children?: ReactNode
  color?: string
  speed?: string
  thickness?: number
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "children" | "className">

export default function StarBorder<T extends ElementType = "button">({
  as,
  className = "",
  innerClassName = "px-6 py-4",
  color = "white",
  speed = "6s",
  thickness = 1,
  children,
  ...rest
}: StarBorderProps<T>) {
  const Component = (as || "button") as ElementType
  return (
    <Component
      className={`relative inline-block overflow-hidden rounded-[20px] ${className}`}
      style={{ padding: `${thickness}px 0` } as CSSProperties}
      {...rest}
    >
      <div
        className="absolute bottom-[-11px] right-[-250%] z-0 h-[50%] w-[300%] animate-star-move-right rounded-full opacity-70"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed,
        }}
      />
      <div
        className="absolute top-[-10px] left-[-250%] z-0 h-[50%] w-[300%] animate-star-move-left rounded-full opacity-70"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed,
        }}
      />
      <div
        className={`relative z-1 rounded-[20px] border border-border bg-card text-foreground text-center ${innerClassName}`}
      >
        {children}
      </div>
    </Component>
  )
}
