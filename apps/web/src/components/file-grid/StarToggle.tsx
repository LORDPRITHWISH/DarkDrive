import { StarIcon } from "@phosphor-icons/react"
import { PopConfirm } from "@workspace/ui/components/popconfirm"
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

  const button = (
    <button
      className={`rounded p-1 transition-opacity  ${
        starred ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
      }`}
      title={starred ? "Remove star" : "Star"}
      aria-label={starred ? "Remove star" : "Star"}
      onClick={starred ? undefined : () => void toggleStarred(type, id)}
    >
      <StarIcon
        size={16}
        weight={starred ? "fill" : "regular"}
        className={starred ? "text-yellow-500" : "text-muted-foreground"}
      />
    </button>
  )

  return (
    <div
      className={` justify-end ${className ?? ""}`}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {starred ? (
        <PopConfirm
          title="Remove from starred?"
          confirmLabel="Remove"
          destructive
          onConfirm={() => toggleStarred(type, id)}
          trigger={button}
        />
      ) : (
        button
      )}
    </div>
  )
}
