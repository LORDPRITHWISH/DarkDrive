import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { Button } from "@workspace/ui/components/button"
import { formatBytes } from "@/lib/format"
import type { FileItem, Folder } from "@/lib/types"

type Resolved =
  | { type: "FILE"; permission: "VIEW" | "EDIT"; file: FileItem }
  | {
      type: "FOLDER"
      permission: "VIEW" | "EDIT"
      folder: Folder
      folders: Folder[]
      files: FileItem[]
    }

export function SharePage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<Resolved | null>(null)
  const [pwPrompt, setPwPrompt] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function resolve(pw?: string) {
    const res = await fetch(`/api/shares/resolve/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pw ? { password: pw } : {}),
    })
    if (res.status === 401) {
      setPwPrompt(true)
      return
    }
    if (!res.ok) {
      setError((await res.json()).error)
      return
    }
    setData(await res.json())
    setPwPrompt(false)
  }

  useEffect(() => {
    void resolve()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (error)
    return (
      <div className="grid min-h-svh place-items-center">
        <div className="text-destructive">Link unavailable: {error}</div>
      </div>
    )

  if (pwPrompt)
    return (
      <div className="grid min-h-svh place-items-center p-4">
        <div className="bg-card w-full max-w-sm rounded-xl border p-6">
          <div className="mb-2 font-medium">Password required</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-background w-full rounded-md border px-3 py-2"
          />
          <Button className="mt-3 w-full" onClick={() => resolve(password)}>
            Unlock
          </Button>
        </div>
      </div>
    )

  if (!data) return <div className="p-8">Loading…</div>

  if (data.type === "FILE") {
    const isImg = data.file.mimeType.startsWith("image/")
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="bg-card rounded-xl border p-6">
          <div className="text-lg font-semibold">{data.file.name}</div>
          <div className="text-muted-foreground text-sm">
            {data.file.mimeType} · {formatBytes(data.file.size)}
          </div>
          {isImg && (
            <img
              className="mt-4 max-h-[60vh] w-full rounded-md object-contain"
              src={`/api/shares/${token}/download`}
            />
          )}
          <div className="mt-4">
            <a
              href={`/api/shares/${token}/download`}
              className="bg-primary text-primary-foreground hover:bg-primary/80 inline-flex items-center rounded-full px-4 py-2 text-sm font-medium"
            >
              Download
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 text-lg font-semibold">{data.folder.name}</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {data.folders.map((f) => (
          <div key={f.id} className="bg-card rounded-lg border p-3 opacity-60">
            <div className="font-medium truncate">📁 {f.name}</div>
            <div className="text-xs text-muted-foreground">Subfolder (browse via owner)</div>
          </div>
        ))}
        {data.files.map((f) => (
          <a
            key={f.id}
            href={`/api/shares/${token}/download/${f.id}`}
            className="bg-card hover:border-primary/60 rounded-lg border p-3 transition-colors"
          >
            <div className="truncate font-medium">{f.name}</div>
            <div className="text-muted-foreground text-xs">
              {f.mimeType} · {formatBytes(f.size)}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
