import { useState } from "react"
import { Navigate } from "react-router-dom"
import { UploadSimpleIcon } from "@phosphor-icons/react"
import { desktop } from "@/lib/desktop"
import { entriesFromDataTransfer } from "@/lib/dropEntries"
import { useAuth } from "@/store/auth"
import { useDrive } from "@/store/drive"

// The desktop app's drop zone: a small window that stays on top (apps/desktop
// drive.ts) and shows only this page. What's dropped on it goes straight to
// My Drive, folders and all, through the same upload the drive page uses, so
// its progress is the same toaster.
export function DropPage() {
  const rootFolderId = useAuth((s) => s.user?.rootFolderId)
  const upload = useDrive((s) => s.upload)
  const [over, setOver] = useState(false)
  if (!desktop) return <Navigate to="/home" replace />
  return (
    <div
      className={`h-screen border-2 border-dashed p-4 transition-colors ${
        over ? "border-primary bg-primary/10" : "border-transparent"
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void entriesFromDataTransfer(e.dataTransfer).then((entries) => {
          if (entries.length && rootFolderId) void upload(entries, rootFolderId)
        })
      }}
    >
      {/* Not a drag target of its own, or crossing it would end the hover. */}
      <div className="pointer-events-none flex h-full flex-col items-center justify-center gap-2 text-center">
        <UploadSimpleIcon size={28} className="text-primary" />
        <div className="text-sm font-semibold">Drop files here</div>
        <div className="text-muted-foreground text-xs">They upload straight to My Drive.</div>
      </div>
    </div>
  )
}
