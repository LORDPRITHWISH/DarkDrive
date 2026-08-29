// A gallery item is a DarkDrive File as /api/gallery serves it: sizes already
// widened to numbers, and `at` resolved to the capture date with upload time
// as the fallback.
export type Item = {
  id: string
  name: string
  size: number
  mimeType: string
  takenAt: string | null
  createdAt: string
  at: string
  isStarred: boolean
  isTrashed: boolean
  thumbnailState: string | null
  sha256: string | null
}

export type Album = {
  id: string
  name: string
  createdAt: string
  count: number
  cover: Item | null
}

export type Me = {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  role: "USER" | "ADMIN"
  storageQuotaBytes: number
}

export type Quota = { used: number; total: number; bytesByType: Record<string, number> }

export const isVideo = (item: Item) =>
  item.mimeType.startsWith("video/") || /\.(mp4|mkv|webm|mov|m4v|avi|3gp)$/i.test(item.name)
