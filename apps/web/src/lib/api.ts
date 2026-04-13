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
  const ct = res.headers.get("content-type") ?? ""
  if (ct.includes("application/json")) return (await res.json()) as T
  return (await res.text()) as unknown as T
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" })
  return handle<T>(res)
}

export async function apiJson<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  return handle<T>(res)
}

export async function apiUpload<T>(
  path: string,
  form: FormData,
  onProgress?: (pct: number) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", path)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100)
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
