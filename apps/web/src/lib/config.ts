import { desktop } from "./desktop"

// Base origin for API + Socket.IO. Empty string => same origin (Vite proxy in dev).
// The desktop app can point at any server, so it says which at runtime.
export const API_BASE: string = (desktop?.apiUrl ?? import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")

// Where links meant for other people (shares, invites, sign-in codes) point.
// Not location.origin in the desktop app: its pages come from darkdrive://app,
// which only exists on this computer.
export const WEB_ORIGIN: string = desktop?.webUrl ?? window.location.origin

export function apiUrl(path: string): string {
  if (!path.startsWith("/")) path = `/${path}`
  return `${API_BASE}${path}`
}
