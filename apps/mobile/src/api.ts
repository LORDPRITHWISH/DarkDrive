import { fetch } from "expo/fetch"

// expo/fetch (rather than the RN global) because it can stream a File straight
// out of the filesystem as a request body — no loading the bytes into JS.

let base = ""
let token = ""

export function configure(apiUrl: string, deviceToken: string) {
  base = apiUrl.replace(/\/+$/, "")
  token = deviceToken
}

export const apiBase = () => base
export const authHeaders = () => ({ Authorization: `Bearer ${token}` })

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export async function api<T = any>(method: string, route: string, body?: unknown): Promise<T> {
  const res = await fetch(base + route, {
    method,
    headers: {
      ...authHeaders(),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new ApiError(`${method} ${route} -> ${res.status}`, res.status)
  return (await res.json()) as T
}
