import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { UploadIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Sidebar } from "@/components/Sidebar"
import { useAuth } from "@/store/auth"
import { useDrive } from "@/store/drive"
import { formatBytes } from "@/lib/format"
import { iconFor } from "@/lib/fileIcon"
import { SHARE_CACHE, nameFromShareKey } from "@/lib/shareInbox"

/** Drain the SW's share inbox back into real File objects. */
async function takeSharedFiles(): Promise<File[]> {
  if (!("caches" in window)) return []
  const cache = await caches.open(SHARE_CACHE)
  const keys = await cache.keys()
  const files: File[] = []
  for (const req of keys) {
    const res = await cache.match(req)
    if (!res) continue
    const blob = await res.blob()
    files.push(new File([blob], nameFromShareKey(req.url), { type: blob.type }))
  }
  return files
}

const clearShareCache = () => caches.delete(SHARE_CACHE)

export function ShareTargetPage() {
  const nav = useNavigate()
  const user = useAuth((s) => s.user)
  const upload = useDrive((s) => s.upload)
  const [files, setFiles] = useState<File[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void takeSharedFiles().then(setFiles)
  }, [])

  // Upload is click-gated rather than automatic: the share sheet can fire on a
  // mis-tap, and silently writing someone's files into their drive is not the
  // kind of thing to do without a confirmation.
  const save = async () => {
    if (!files?.length || !user) return
    setBusy(true)
    await clearShareCache() // drop the copies before the slow part
    await upload(files, user.rootFolderId)
    nav(`/drive/${user.rootFolderId}`, { replace: true })
  }

  const discard = async () => {
    await clearShareCache()
    nav("/home", { replace: true })
  }

  return (
    <div className="flex h-svh">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b p-3">
          <h1 className="font-semibold">Save to DarkDrive</h1>
        </header>
        <div className="flex-1 overflow-auto px-4 py-5 md:px-6">
          {files === null ? (
            <div className="text-muted-foreground text-sm">Reading shared files…</div>
          ) : files.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              Nothing was shared. Files may have already been saved.
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-3 rounded-md border p-2.5"
                >
                  {iconFor(f.type, 28, f.name)}
                  <div className="min-w-0 flex-1">
                    <div className="selectable truncate text-sm">{f.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {formatBytes(f.size)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!!files?.length && (
          <div className="flex gap-2 border-t p-3 pb-safe">
            <Button variant="outline" onClick={discard} disabled={busy} className="flex-1">
              <XIcon size={16} /> Discard
            </Button>
            <Button onClick={save} disabled={busy} className="flex-1">
              <UploadIcon size={16} weight="bold" />
              {busy ? "Saving…" : `Save ${files.length} file${files.length > 1 ? "s" : ""}`}
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
