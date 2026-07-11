import type { SearchTypeFilter } from "./types"

const DOC_EXT = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "odt", "ods", "odp", "rtf", "csv", "tsv", "md", "txt",
])
const ARCHIVE_EXT = new Set(["zip", "rar", "7z", "tar", "gz", "bz2", "xz"])

function extOf(name: string): string {
  const dot = name.lastIndexOf(".")
  if (dot < 0 || dot === name.length - 1) return ""
  return name.slice(dot + 1).toLowerCase()
}

// Mirrors apps/api/src/lib/fileType.ts's categorization so the client-side
// filter chips agree with what the server actually returns.
export function fileCategory(
  mimeType: string,
  name: string
): Exclude<SearchTypeFilter, "all" | "folder"> {
  const ext = extOf(name)
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("audio/")) return "audio"
  if (
    ARCHIVE_EXT.has(ext) ||
    mimeType.includes("zip") ||
    mimeType.includes("tar") ||
    mimeType.includes("rar")
  )
    return "archive"
  if (
    DOC_EXT.has(ext) ||
    mimeType.startsWith("text/") ||
    mimeType.includes("officedocument") ||
    mimeType.includes("ms-powerpoint") ||
    mimeType === "application/msword" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/pdf"
  )
    return "doc"
  return "other"
}

export const SEARCH_TYPE_LABELS: Record<SearchTypeFilter, string> = {
  all: "All",
  folder: "Folders",
  image: "Images",
  video: "Videos",
  audio: "Audio",
  doc: "Docs",
  archive: "Archives",
  other: "Other",
}
