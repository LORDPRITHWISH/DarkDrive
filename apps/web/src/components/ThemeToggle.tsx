import { SunIcon, MoonIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { useTheme } from "@/components/theme-provider"

// Magic UI's AnimatedThemeToggler: the new theme expands as a circle from
// this button (the reveal itself lives in the theme provider's toggleTheme).
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const next = theme === "dark" ? "light" : "dark"

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={(e) => {
        const { left, top, width, height } = e.currentTarget.getBoundingClientRect()
        toggleTheme({ x: left + width / 2, y: top + height / 2 })
      }}
      title={`Switch to ${next} theme (D)`}
      aria-label={`Switch to ${next} theme`}
    >
      {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
    </Button>
  )
}
