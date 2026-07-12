import { KeyboardIcon } from "@phosphor-icons/react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["↑", "↓"], label: "Move selection" },
  { keys: ["Shift", "Click"], label: "Select range" },
  { keys: ["Ctrl/⌘", "Click"], label: "Add/remove from selection" },
  { keys: ["Ctrl/⌘", "A"], label: "Select all" },
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
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm gap-0 p-0">
        <DialogHeader className="flex-row items-center gap-2 border-b p-4">
          <KeyboardIcon size={18} />
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  )
}
