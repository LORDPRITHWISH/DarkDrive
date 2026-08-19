import mime from "mime-types"

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

// mime-types maps .ts/.mts/.cts to video/mp2t (MPEG transport stream). In a
// drive that holds source trees those are TypeScript, and every one of them was
// being handed to ffmpeg for a thumbnail it could never produce.
// ponytail: a genuine MPEG-TS upload now gets an icon instead of a thumbnail —
// sniff the container if that ever comes up.
const EXT_MIME: Record<string, string> = {
  ts: "text/plain",
  mts: "text/plain",
  cts: "text/plain",
}

// Single source of truth for a file's type: the override beats both the
// browser-supplied type and mime.lookup(). Upload stores the result, and the
// classifiers below re-run it so rows written before this still classify right.
export function resolveMime(name: string, provided?: string | null): string {
  return EXT_MIME[extOf(name)] || provided || mime.lookup(name) || "application/octet-stream"
}

// Best-effort classification used by search's type filter. Extension wins
// over MIME type since uploads often carry a generic
// application/octet-stream mimeType from the browser.
export function fileCategory(rawMime: string, name: string): FileCategory {
  const ext = extOf(name)
  const mimeType = resolveMime(name, rawMime)
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
