import { useEffect, useRef, useState } from "react"
import { StarIcon } from "@phosphor-icons/react"
import { useDrive } from "@/store/drive"

export function StarToggle({
  type,
  id,
  starred,
  className,
}: {
  type: "folder" | "file"
  id: string
  starred: boolean
  className?: string
}) {
  const toggleStarred = useDrive((s) => s.toggleStarred)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!confirmOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setConfirmOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [confirmOpen])

  async function handle(e: React.MouseEvent) {
    e.stopPropagation()
    if (starred) {
      setConfirmOpen((v) => !v)
    } else {
      await toggleStarred(type, id)
    }
  }

  return (
    <div
      ref={ref}
      className={` justify-end ${className ?? ""}`}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={handle}
        className={`rounded p-1 transition-opacity  ${
          starred ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
        }`}
        title={starred ? "Remove star" : "Star"}
        aria-label={starred ? "Remove star" : "Star"}
      >
        <StarIcon
          size={16}
          weight={starred ? "fill" : "regular"}
          className={starred ? "text-yellow-500" : "text-muted-foreground"}
        />
      </button>
      {confirmOpen && (
        <div className="bg-popover text-popover-foreground absolute top-full right-0 z-20 mt-1 w-44 rounded-md border p-2 text-sm shadow-lg">
          <div className="mb-2">Remove from starred?</div>
          <div className="flex justify-end gap-1">
            <button
              onClick={() => setConfirmOpen(false)}
              className="hover:bg-accent rounded px-2 py-1 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await toggleStarred(type, id)
                setConfirmOpen(false)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded px-2 py-1 text-xs"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
