import { apiUrl } from "@/lib/config"
import type { PublicSpace, Space } from "@/lib/types"
import { getSpaceIcon } from "@/lib/spaceIcons"

type Props = {
  space: Pick<
    Space | PublicSpace,
    "id" | "name" | "color" | "logoKey" | "icon"
  >
  size?: number
  className?: string
}

// Render a space's visual badge. Precedence: uploaded logo > curated icon >
// gradient fallback with the space's first letter. The caller controls
// spacing, rings, etc.
export function SpaceLogo({ space, size = 40, className = "" }: Props) {
  const radius =
    size >= 48 ? "rounded-2xl" : size >= 28 ? "rounded-xl" : "rounded-lg"

  if (space.logoKey) {
    return (
      <img
        src={apiUrl(`/api/spaces/${space.id}/logo`)}
        alt=""
        style={{ width: size, height: size }}
        className={`${radius} object-cover ${className}`}
      />
    )
  }

  const iconEntry = getSpaceIcon(space.icon)
  const bgStyle: React.CSSProperties = space.color
    ? { backgroundColor: space.color }
    : {}
  const bgClass = space.color ? "" : "from-primary to-primary/60 bg-linear-to-br"

  if (iconEntry) {
    const { Icon } = iconEntry
    return (
      <div
        className={`${radius} text-primary-foreground grid place-items-center shadow-sm ${bgClass} ${className}`}
        style={{ width: size, height: size, ...bgStyle }}
        aria-hidden
      >
        <Icon size={Math.max(12, Math.floor(size * 0.55))} weight="fill" />
      </div>
    )
  }

  const initial = space.name.trim().charAt(0).toUpperCase() || "?"
  return (
    <div
      className={`${radius} text-primary-foreground grid place-items-center font-black shadow-sm ${bgClass} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.floor(size * 0.45)),
        ...bgStyle,
      }}
      aria-hidden
    >
      {initial}
    </div>
  )
}
