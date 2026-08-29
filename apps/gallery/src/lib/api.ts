// Base origin for the API. Empty string => same origin (the Vite proxy in
// dev), which also keeps the session cookie on <img> thumbnail requests.
export const API_BASE: string = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`
}

export type ApiError = { error: string; issues?: unknown }

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: ApiError | null = null
    try {
      body = (await res.json()) as ApiError
    } catch {}
    throw Object.assign(new Error(body?.error || `http_${res.status}`), {
      status: res.status,
      body,
    })
  }
  return res.headers.get("content-type")?.includes("application/json")
    ? ((await res.json()) as T)
    : ((await res.text()) as unknown as T)
}

export async function apiGet<T>(path: string): Promise<T> {
  return handle<T>(await fetch(apiUrl(path), { credentials: "include" }))
}

export async function apiJson<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  return handle<T>(
    await fetch(apiUrl(path), {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  )
}

function apiUpload<T>(path: string, form: FormData, onProgress: (pct: number) => void): Promise<T> {
  // XHR rather than fetch: upload progress is the whole point of a photo
  // uploader, and fetch still can't report it.
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", apiUrl(path))
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100)
    }
    xhr.onload = () => {
      try {
        const parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(parsed as T)
        else reject(Object.assign(new Error(parsed?.error || "upload_failed"), { status: xhr.status }))
      } catch (e) {
        reject(e)
      }
    }
    xhr.onerror = () => reject(new Error("network_error"))
    xhr.send(form)
  })
}

const DEFAULT_CHUNK_SIZE = 25 * 1024 * 1024

/**
 * Uploads one file into the gallery through DarkDrive's chunked endpoints —
 * the same transport the drive and the sync clients use, so resumable-sized
 * chunks, quota checks and dedupe hashing all come along for free.
 *
 * `takenAt` is only a hint: the server prefers the file's own EXIF when it has
 * any, and falls back to this (the file's own timestamp) when it doesn't.
 */
export async function uploadFile(
  file: File,
  folderId: string,
  onProgress: (bytesSent: number) => void
): Promise<{ file: { id: string } }> {
  const init = await apiJson<{ uploadId: string; chunkSize: number }>(
    "/api/files/upload/init",
    "POST",
    {
      folderId,
      name: file.name,
      size: file.size,
      mimeType: file.type || undefined,
      takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
    }
  )
  const chunkSize = init.chunkSize || DEFAULT_CHUNK_SIZE
  const total = Math.max(1, Math.ceil(file.size / chunkSize))
  let sent = 0
  try {
    for (let i = 0; i < total; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const form = new FormData()
      form.append("chunkIndex", String(i))
      form.append("chunk", file.slice(start, end), `${i}`)
      const chunkStart = sent
      await apiUpload(`/api/files/upload/${init.uploadId}/chunk`, form, (pct) =>
        onProgress(chunkStart + (pct / 100) * (end - start))
      )
      sent += end - start
      onProgress(sent)
    }
    return await apiJson(`/api/files/upload/${init.uploadId}/complete`, "POST", {
      totalChunks: total,
    })
  } catch (e) {
    // Best-effort abort so the server drops the tmp chunks now rather than
    // waiting out its session TTL.
    try {
      await apiJson(`/api/files/upload/${init.uploadId}`, "DELETE")
    } catch {}
    throw e
  }
}

export const thumbUrl = (id: string) => apiUrl(`/api/files/${id}/thumbnail`)
export const fullUrl = (id: string) => apiUrl(`/api/files/${id}/download?inline=1`)
export const downloadUrl = (id: string) => apiUrl(`/api/files/${id}/download`)
