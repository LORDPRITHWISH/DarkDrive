import { useEffect, useRef, useState } from "react"

const PAGE_SIZE = 60

/**
 * Reveal a long folder in pages instead of dumping it all at once: more shows
 * as the sentinel scrolls into view. Starts over when `folder` changes.
 */
export function usePaged(total: number, folder: unknown) {
  // The count belongs to the folder it was reached in; another folder's is the first page.
  const [page, setPage] = useState({ folder, count: PAGE_SIZE })
  const visibleCount = page.folder === folder ? page.count : PAGE_SIZE
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || visibleCount >= total) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setPage({ folder, count: Math.min(total, visibleCount + PAGE_SIZE) })
      },
      { rootMargin: "600px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visibleCount, total, folder])
  return { visibleCount, sentinelRef }
}
