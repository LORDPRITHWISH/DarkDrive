import { useEffect, useState } from "react"
import { FolderIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"

export const FOLDER_COLORS: { label: string; value: string }[] = [
  { label: "Default", value: "" },
  { label: "Slate", value: "#64748b" },
  { label: "Red", value: "#ef4444" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Yellow", value: "#eab308" },
  { label: "Green", value: "#10b981" },
  { label: "Cyan", value: "#06b6d4" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Pink", value: "#ec4899" },
]

type Props = {
  open: boolean
  initialName?: string
  initialColor?: string | null
  title?: string
  submitLabel?: string
  onClose: () => void
  onSubmit: (name: string, color: string | null) => void | Promise<void>
}

export function NewFolderDialog({
  open,
  initialName = "",
  initialColor = null,
  title = "New folder",
  submitLabel = "Create",
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState<string>(initialColor ?? "")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setColor(initialColor ?? "")
    setBusy(false)
  }, [open, initialName, initialColor])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [open, onClose])

  if (!open) return null

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await onSubmit(name.trim(), color ? color : null)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background w-full max-w-sm rounded-lg border p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="hover:bg-accent rounded p-1" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>

        <div className="mb-4 flex items-center justify-center">
          <FolderIcon
            size={64}
            weight="fill"
            style={{ color: color || undefined }}
            className={color ? "" : "text-primary"}
          />
        </div>

        <label className="mb-4 block">
          <span className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wider">
            Name
          </span>
          <input
            className="bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            placeholder="Folder name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit()
            }}
            autoFocus
          />
        </label>

        <div className="mb-5">
          <span className="text-muted-foreground mb-2 block text-xs font-medium uppercase tracking-wider">
            Color
          </span>
          <div className="flex flex-wrap gap-2">
            {FOLDER_COLORS.map((c) => {
              const selected = color === c.value
              return (
                <button
                  key={c.label}
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  aria-label={c.label}
                  className={`h-7 w-7 rounded-full border-2 transition-all ${
                    selected ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{
                    background: c.value || "var(--primary)",
                  }}
                />
              )
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || busy}>
            {busy ? "Saving…" : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
