import { useState } from "react"
import type { FileItem } from "@/lib/types"
import { apiUrl } from "@/lib/config"
import { iconFor } from "@/lib/fileIcon"
import { thumbnailable } from "@/lib/thumb"

// Renders a file's preview thumbnail when one is available (or can be generated
// on demand), falling back to the type icon for non-thumbnailable files or if
// the thumbnail request fails. The same component backs both the grid card
// (large) and the list row (small) via `iconSize`.
export function FileThumb({
  file,
  iconSize = 72,
  className = "h-full w-full object-cover",
}: {
  file: FileItem
  iconSize?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (failed || !thumbnailable(file)) {
    return <>{iconFor(file.mimeType, iconSize, file.name)}</>
  }

  return (
    <img
      src={apiUrl(`/api/files/${file.id}/thumbnail`)}
      alt=""
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
