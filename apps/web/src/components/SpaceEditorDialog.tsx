import { useEffect, useRef, useState } from "react"
import {
  UploadIcon,
  TrashIcon,
  PencilSimpleIcon,
  ImageIcon,
  ShapesIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { apiUpload } from "@/lib/api"
import { useDrive } from "@/store/drive"
import type { Space } from "@/lib/types"
import { SpaceLogo } from "./SpaceLogo"
import { SPACE_ICONS } from "@/lib/spaceIcons"

// Curated palette — feels opinionated without pulling in a full color picker.
// All values are OKLCH-friendly darks that read well on our card background.
const COLOR_PRESETS: { name: string; value: string }[] = [
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Emerald", value: "#10b981" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Slate", value: "#64748b" },
]

export function SpaceEditorDialog({
  mode,
  onClose,
  onCreated,
}: {
  mode: { kind: "create" } | { kind: "edit"; space: Space } | null
  onClose: () => void
  onCreated?: (space: Space) => void
}) {
  const { createSpace, updateSpace } = useDrive()
  const fileInput = useRef<HTMLInputElement>(null)

  const [name, setName] = useState("")
  const [color, setColor] = useState<string | null>(null)
  const [logoKey, setLogoKey] = useState<string | null>(null)
  const [icon, setIcon] = useState<string | null>(null)
  const [logoTab, setLogoTab] = useState<"icon" | "image">("icon")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Seed form state from the mode. Keyed on the space id / create so
  // reopening the dialog for a different space doesn't leak stale values.
  const key = mode?.kind === "edit" ? mode.space.id : mode?.kind ?? null
  useEffect(() => {
    if (!mode) return
    if (mode.kind === "create") {
      setName("")
      setColor(COLOR_PRESETS[0].value)
      setLogoKey(null)
      setIcon(null)
      setLogoTab("icon")
    } else {
      setName(mode.space.name)
      setColor(mode.space.color)
      setLogoKey(mode.space.logoKey)
      setIcon(mode.space.icon)
      setLogoTab(mode.space.logoKey ? "image" : "icon")
    }
    setErr(null)
    setBusy(false)
    setUploadingLogo(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!mode) return null

  const isCreate = mode.kind === "create"
  // Mirror the in-flight form state onto a synthetic Space-shaped object so
  // the SpaceLogo preview updates live as the user picks a color / uploads.
  const preview = {
    id: mode.kind === "edit" ? mode.space.id : "preview",
    name: name || "?",
    color,
    logoKey,
    icon,
  }

  async function pickLogo(file: File) {
    setUploadingLogo(true)
    setErr(null)
    try {
      const form = new FormData()
      form.append("logo", file)
      const r = await apiUpload<{ logoKey: string }>("/api/spaces/logo", form)
      // Image takes precedence over icon — clear the icon so the preview
      // doesn't flicker between them on save.
      setIcon(null)
      setLogoKey(r.logoKey)
    } catch (e) {
      setErr(
        e instanceof Error && e.message === "only_images_allowed"
          ? "Logo must be an image."
          : "Upload failed."
      )
    } finally {
      setUploadingLogo(false)
    }
  }

  function pickIcon(key: string) {
    // Picking an icon clears any uploaded image so only one wins.
    setLogoKey(null)
    setIcon(key === icon ? null : key)
  }

  async function save() {
    // Snapshot the discriminated mode here so TS keeps the narrowing through
    // the await boundary. `mode` is a prop that could (in theory) change.
    const m = mode
    if (!m || !name.trim() || busy) return
    setBusy(true)
    setErr(null)
    try {
      if (m.kind === "create") {
        const s = await createSpace(name.trim(), { color, logoKey, icon })
        onCreated?.(s)
      } else {
        await updateSpace(m.space.id, {
          name: name.trim(),
          color,
          logoKey,
          icon,
        })
      }
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle>{isCreate ? "New space" : "Edit space"}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Give your space a name, a color, and an optional logo."
              : "Update the name, color, or logo."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 p-5">
          {/* Logo preview + picker */}
          <div className="flex items-start gap-4">
            <SpaceLogo
              space={preview}
              size={72}
              className="ring-background shrink-0 ring-4"
            />
            <div className="min-w-0 flex-1">
              <Tabs value={logoTab} onValueChange={(v) => setLogoTab(v as "icon" | "image")}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">Logo</div>
                  <TabsList className="bg-muted h-auto shrink-0 gap-0 rounded-lg border-none p-0.5">
                    <TabsTrigger
                      value="icon"
                      className="gap-1 rounded-md border-none px-2 py-1 text-xs data-active:bg-background data-active:shadow-sm"
                    >
                      <ShapesIcon size={12} weight="bold" />
                      Icon
                    </TabsTrigger>
                    <TabsTrigger
                      value="image"
                      className="gap-1 rounded-md border-none px-2 py-1 text-xs data-active:bg-background data-active:shadow-sm"
                    >
                      <ImageIcon size={12} weight="bold" />
                      Image
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="icon">
                  <div className="text-muted-foreground mb-2 text-xs">
                    Pick an icon from the set below. It's tinted with the
                    space color.
                  </div>
                  <div className="grid max-h-44 grid-cols-9 gap-1 overflow-auto pr-1">
                    {SPACE_ICONS.map(({ key, label, Icon }) => {
                      const selected = icon === key
                      return (
                        <button
                          key={key}
                          type="button"
                          title={label}
                          onClick={() => pickIcon(key)}
                          className={`grid aspect-square place-items-center rounded-lg border transition-all ${
                            selected
                              ? "border-primary bg-primary/10 text-primary"
                              : "hover:bg-accent text-muted-foreground hover:text-foreground border-transparent"
                          }`}
                          aria-pressed={selected}
                        >
                          <Icon size={16} weight="fill" />
                        </button>
                      )
                    })}
                  </div>
                  {icon && (
                    <button
                      type="button"
                      onClick={() => setIcon(null)}
                      className="text-muted-foreground hover:text-foreground mt-1.5 text-[11px] hover:underline"
                    >
                      Clear icon
                    </button>
                  )}
                </TabsContent>

                <TabsContent value="image">
                  <div className="text-muted-foreground mb-2 text-xs">
                    {logoKey
                      ? "Click to replace."
                      : "PNG or JPG, up to 2 MB."}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInput.current?.click()}
                      disabled={uploadingLogo}
                    >
                      <UploadIcon size={14} weight="bold" />
                      {uploadingLogo
                        ? "Uploading…"
                        : logoKey
                          ? "Replace image"
                          : "Upload image"}
                    </Button>
                    {logoKey && (
                      <button
                        type="button"
                        onClick={() => setLogoKey(null)}
                        className="text-destructive hover:bg-destructive/10 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium"
                      >
                        <TrashIcon size={11} />
                        Remove
                      </button>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void pickLogo(f)
                e.target.value = ""
              }}
            />
          </div>

          <div>
            <label className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
              <PencilSimpleIcon size={12} />
              Name
            </label>
            <Input
              autoFocus
              placeholder="Marketing, Engineering, Design…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save()
              }}
              maxLength={120}
            />
          </div>

          <div>
            <div className="text-muted-foreground mb-1.5 text-[11px] font-semibold uppercase tracking-wider">
              Color
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_PRESETS.map((c) => {
                const selected = color === c.value
                return (
                  <button
                    key={c.value}
                    type="button"
                    title={c.name}
                    onClick={() => setColor(c.value)}
                    className={`h-8 w-8 rounded-full transition-all ${
                      selected
                        ? "ring-foreground ring-2 ring-offset-2 ring-offset-background scale-110"
                        : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: c.value }}
                    aria-label={c.name}
                  />
                )
              })}
              <label
                className="bg-muted hover:bg-accent relative ml-1 inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors"
                title="Custom color"
              >
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: color ?? "#888" }}
                />
                Custom
                <input
                  type="color"
                  value={color ?? "#6366f1"}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              {color && (
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  className="text-muted-foreground hover:text-foreground ml-1 text-xs hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {err && (
            <div className="text-destructive text-xs font-medium">{err}</div>
          )}
        </div>

        <DialogFooter className="bg-muted/30 border-t px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            onClick={save}
            disabled={!name.trim() || busy || uploadingLogo}
          >
            {busy ? "Saving…" : isCreate ? "Create space" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
