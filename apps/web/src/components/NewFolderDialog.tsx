import { useEffect, useRef, useState } from "react"
import { FolderIcon, ImageIcon, TrashIcon, UploadIcon, XIcon } from "@phosphor-icons/react"
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
  onSubmit: (name: string, color: string | null, thumbnail: File | null) => void | Promise<void>
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
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [thumbPreview, setThumbPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setColor(initialColor ?? "")
    setThumbnail(null)
    setThumbPreview(null)
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

  useEffect(() => {
    return () => {
      if (thumbPreview) URL.revokeObjectURL(thumbPreview)
    }
  }, [thumbPreview])

  if (!open) return null

  function pickFile(file: File) {
    if (thumbPreview) URL.revokeObjectURL(thumbPreview)
    setThumbnail(file)
    setThumbPreview(URL.createObjectURL(file))
  }

  function clearThumb() {
    if (thumbPreview) URL.revokeObjectURL(thumbPreview)
    setThumbnail(null)
    setThumbPreview(null)
  }

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await onSubmit(name.trim(), color ? color : null, thumbnail)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card animate-in fade-in zoom-in-95 w-full max-w-sm rounded-2xl border shadow-2xl duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button className="hover:bg-accent rounded-lg p-1.5 transition-colors" onClick={onClose} aria-label="Close">
            <XIcon size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Thumbnail preview */}
          <div className="flex items-center gap-4">
            <div className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted">
              {thumbPreview ? (
                <>
                  <img src={thumbPreview} alt="" className="h-full w-full object-cover" />
                  <div className="bg-background/80 absolute right-1 bottom-1 rounded p-0.5 backdrop-blur-sm">
                    <FolderIcon
                      size={10}
                      weight="fill"
                      style={{ color: color || undefined }}
                      className={color ? "" : "text-primary"}
                    />
                  </div>
                </>
              ) : (
                <FolderIcon
                  size={36}
                  weight="fill"
                  style={{ color: color || undefined }}
                  className={color ? "" : "text-primary"}
                />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-medium text-muted-foreground">Thumbnail</div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                  <UploadIcon size={13} />
                  {thumbPreview ? "Replace" : "Upload image"}
                </Button>
                {thumbPreview && (
                  <button
                    type="button"
                    onClick={clearThumb}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                  >
                    <TrashIcon size={11} />
                    Remove
                  </button>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">Optional · PNG or JPG</div>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) pickFile(f)
                e.target.value = ""
              }}
            />
          </div>

          {/* Name */}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Name
            </span>
            <input
              className="bg-background focus-visible:ring-ring w-full rounded-xl border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              placeholder="Folder name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit()
              }}
              autoFocus
            />
          </label>

          {/* Color */}
          <div>
            <span className="mb-2 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
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
                    style={{ background: c.value || "var(--primary)" }}
                  />
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!name.trim() || busy}>
            {busy ? "Saving…" : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
