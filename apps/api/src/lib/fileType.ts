export type FileCategory = "image" | "video" | "audio" | "doc" | "archive" | "other"

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

// Best-effort classification used by search's type filter. Extension wins
// over MIME type since uploads often carry a generic
// application/octet-stream mimeType from the browser.
export function fileCategory(mimeType: string, name: string): FileCategory {
  const ext = extOf(name)
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("audio/")) return "audio"
  if (
    ARCHIVE_EXT.has(ext) ||
    mimeType.includes("zip") ||
    mimeType.includes("tar") ||
    mimeType.includes("rar") ||
    mimeType.includes("7z-compressed")
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
