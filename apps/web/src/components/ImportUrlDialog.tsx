import { useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Modal } from "@/components/Modal"

type Props = {
  open: boolean
  onClose: () => void
  onSubmit: (url: string, name?: string) => Promise<void>
}

export function ImportUrlDialog({ open, onClose, onSubmit }: Props) {
  const [url, setUrl] = useState("")
  const [name, setName] = useState("")

  useEffect(() => {
    if (!open) return
    setUrl("")
    setName("")
  }, [open])

  const valid = /^https?:\/\/.+/i.test(url.trim())

  // Kicks off the import and closes right away — the download itself runs
  // in the background and shows up in the upload toaster, same as a
  // regular file upload.
  function submit() {
    if (!valid) return
    void onSubmit(url.trim(), name.trim() || undefined)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      bodyClassName="space-y-4 p-4"
      title="Import from URL"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!valid}>
            Import
          </Button>
        </>
      }
    >
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
          File URL
        </span>
        <Input
          placeholder="https://example.com/file.mp4"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit()
          }}
          autoFocus
        />
        <span className="mt-1 block text-[11px] text-muted-foreground">
          A direct link to a file — the server downloads it straight into this
          folder. Pages (like a YouTube watch page) won't work, only direct file
          links.
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Name <span className="normal-case text-muted-foreground/70">(optional)</span>
        </span>
        <Input
          placeholder="Leave blank to use the URL's filename"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit()
          }}
        />
      </label>
    </Modal>
  )
}
