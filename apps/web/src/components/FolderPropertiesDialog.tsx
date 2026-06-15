import { useEffect, useRef, useState } from "react"
import { FolderIcon, TrashIcon, UploadIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { apiJson, apiUpload } from "@/lib/api"
import { apiUrl } from "@/lib/config"
import { useDrive } from "@/store/drive"
import type { Folder } from "@/lib/types"
import { FOLDER_COLORS } from "./NewFolderDialog"

type ThumbState = "keep" | "replace" | "remove"

export function FolderPropertiesDialog({
  folder,
  onClose,
}: {
  folder: Folder | null
  onClose: () => void
}) {
  const { refresh } = useDrive()
  const fileInput = useRef<HTMLInputElement>(null)

  const [name, setName] = useState("")
  const [color, setColor] = useState<string>("")
  const [thumbState, setThumbState] = useState<ThumbState>("keep")
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!folder) return
    setName(folder.name)
    setColor(folder.color ?? "")
    setThumbState("keep")
    setPendingFile(null)
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingPreview(null)
    setErr(null)
    setBusy(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder?.id])

  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    }
  }, [pendingPreview])

  useEffect(() => {
    if (!folder) return
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [folder, onClose])

  if (!folder) return null

  function pickFile(file: File) {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(file)
    setPendingPreview(URL.createObjectURL(file))
    setThumbState("replace")
  }

  function removeThumb() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(null)
    setPendingPreview(null)
    setThumbState("remove")
  }

  // The active color is the locally edited one (for live preview)
  const activeColor = color

  async function save() {
    if (!folder || !name.trim() || busy) return
    setBusy(true)
    setErr(null)
    try {
      const patch: Record<string, unknown> = {}
      if (name.trim() !== folder.name) patch.name = name.trim()
      const newColor = color || null
      if (newColor !== (folder.color ?? null)) patch.color = newColor
      if (Object.keys(patch).length > 0)
        await apiJson(`/api/folders/${folder.id}`, "PATCH", patch)

      if (thumbState === "replace" && pendingFile) {
        const form = new FormData()
        form.append("thumbnail", pendingFile)
        await apiUpload(`/api/folders/${folder.id}/thumbnail`, form)
      } else if (thumbState === "remove") {
        await apiJson(`/api/folders/${folder.id}/thumbnail`, "DELETE")
      }

      await refresh()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save_failed")
    } finally {
      setBusy(false)
    }
  }

  // What to show in the thumbnail preview area
  const hasExistingThumb = !!folder.thumbnailKey && thumbState !== "remove"
  const thumbSrc =
    thumbState === "replace" && pendingPreview
      ? pendingPreview
      : hasExistingThumb
        ? apiUrl(`/api/folders/${folder.id}/thumbnail`)
        : null

  return (
    <div
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm duration-150"
      onClick={onClose}
    >
      <div
        className="bg-card animate-in fade-in zoom-in-95 w-full max-w-sm overflow-hidden rounded-2xl border shadow-2xl duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-base font-semibold">Folder properties</h3>
          <button
            className="hover:bg-accent rounded-lg p-1.5 transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Thumbnail */}
          <div className="flex items-start gap-4">
            {/* Preview */}
            <div className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted">
              {thumbSrc ? (
                <>
                  <img src={thumbSrc} alt="" className="h-full w-full object-cover" />
                  <div className="absolute right-1.5 bottom-1.5 rounded-md bg-background/80 p-1 backdrop-blur-sm">
                    <FolderIcon
                      size={12}
                      weight="fill"
                      style={{ color: activeColor || undefined }}
                      className={activeColor ? "" : "text-primary"}
                    />
                  </div>
                </>
              ) : (
                <FolderIcon
                  size={40}
                  weight="fill"
                  style={{ color: activeColor || undefined }}
                  className={activeColor ? "" : "text-primary"}
                />
              )}
            </div>

            {/* Controls */}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="text-xs font-medium text-muted-foreground">Thumbnail</div>
              <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                <UploadIcon size={13} />
                {thumbSrc ? "Replace image" : "Upload image"}
              </Button>
              {(thumbSrc || thumbState === "replace") && (
                <button
                  type="button"
                  onClick={removeThumb}
                  className="inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  <TrashIcon size={11} />
                  Remove thumbnail
                </button>
              )}
              <div className="text-[11px] text-muted-foreground">PNG or JPG, up to 10 MB</div>
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
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Name
            </span>
            <input
              autoFocus
              className="bg-background focus-visible:ring-primary/40 w-full rounded-xl border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save()
              }}
              maxLength={255}
            />
          </label>

          {/* Color */}
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Color
            </div>
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
                      selected ? "scale-110 border-foreground" : "border-transparent"
                    }`}
                    style={{ background: c.value || "var(--primary)" }}
                  />
                )
              })}
            </div>
          </div>

          {err && <div className="text-xs font-medium text-destructive">{err}</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={!name.trim() || busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}
