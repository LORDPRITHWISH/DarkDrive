// Base origin for API + Socket.IO. Empty string => same origin (Vite proxy in dev).
export const API_BASE: string = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")

export function apiUrl(path: string): string {
  if (!path.startsWith("/")) path = `/${path}`
  return `${API_BASE}${path}`
}
