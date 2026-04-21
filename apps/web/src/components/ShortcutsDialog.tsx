import { useEffect } from "react"
import { XIcon, KeyboardIcon } from "@phosphor-icons/react"

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["↑", "↓"], label: "Move selection" },
  { keys: ["Enter"], label: "Open folder / preview file" },
  { keys: ["Del"], label: "Move selection to bin" },
  { keys: ["Esc"], label: "Close dialog / clear selection" },
  { keys: ["?"], label: "Show this cheatsheet" },
]

export function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm duration-150"
      onClick={onClose}
    >
      <div
        className="bg-card animate-in fade-in zoom-in-95 w-full max-w-sm rounded-2xl border shadow-2xl duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b p-4">
          <div className="flex items-center gap-2">
            <KeyboardIcon size={18} />
            <h3 className="text-base font-bold tracking-tight">
              Keyboard shortcuts
            </h3>
          </div>
          <button
            className="hover:bg-accent shrink-0 rounded-lg p-1.5"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon size={14} />
          </button>
        </div>
        <ul className="flex flex-col p-2">
          {SHORTCUTS.map((s) => (
            <li
              key={s.label}
              className="hover:bg-accent/40 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
            >
              <span>{s.label}</span>
              <span className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="bg-muted text-muted-foreground inline-flex min-w-[22px] items-center justify-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
