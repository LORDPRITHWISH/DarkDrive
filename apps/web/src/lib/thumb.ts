// Mirrors the server's thumbnail classification (apps/api/src/lib/thumbnails.ts).
// Used by the grid/list to decide whether to attempt loading a thumbnail before
// falling back to a type icon — keeps us from firing 404-bound requests for
// files the pipeline can never render (text, archives, audio, …).
export function thumbnailable(file: { mimeType: string; name: string }): boolean {
  const m = file.mimeType.toLowerCase()
  const e = (file.name.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase()
  if (m.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|avif|ico|svg)$/.test(e))
    return true
  if (m.startsWith("video/") || /\.(mp4|mkv|webm|mov|avi|m4v|wmv|flv|mpe?g|3gp|ts)$/.test(e))
    return true
  if (m === "application/pdf" || e === ".pdf") return true
  if (
    /officedocument|ms-powerpoint|msword|ms-excel|opendocument/.test(m) ||
    /\.(docx?|pptx?|xlsx?|odt|odp|ods|odg|rtf)$/.test(e)
  )
    return true
  return false
}
