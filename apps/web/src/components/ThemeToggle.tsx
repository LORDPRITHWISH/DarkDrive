import { SunIcon, MoonIcon, DesktopIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { useTheme } from "@/components/theme-provider"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system"
  const icon =
    theme === "system" ? (
      <DesktopIcon size={16} />
    ) : theme === "light" ? (
      <SunIcon size={16} />
    ) : (
      <MoonIcon size={16} />
    )

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => setTheme(next)}
      title={`Theme: ${theme} (click for ${next})`}
      aria-label={`Switch theme to ${next}`}
    >
      {icon}
    </Button>
  )
}
