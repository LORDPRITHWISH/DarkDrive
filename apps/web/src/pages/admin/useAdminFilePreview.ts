import { useState } from "react"
import { apiGet } from "@/lib/api"
import { toast } from "@/store/toast"
import type { FileItem } from "@/lib/types"

// Shared by every admin panel that lists files (largest files, duplicates,
// recent activity, recycle bin): fetches the full record for a file id
// regardless of owner or trash state, then hands it to <FilePreview>. The
// actual bytes stream from the ordinary /api/files/:id/* routes, which grant
// admins read-only access to any file (see api lib/access.ts).
export function useAdminFilePreview() {
  const [preview, setPreview] = useState<FileItem | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function open(id: string) {
    setLoadingId(id)
    try {
      const file = await apiGet<FileItem>(`/api/admin/files/${id}`)
      setPreview(file)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open file.")
    } finally {
      setLoadingId(null)
    }
  }

  return { preview, loadingId, open, close: () => setPreview(null) }
}
