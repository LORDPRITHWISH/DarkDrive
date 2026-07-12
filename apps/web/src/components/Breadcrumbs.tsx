import { Link } from "react-router-dom"
import { CaretRightIcon } from "@phosphor-icons/react"
import { useDrive } from "@/store/drive"

export function Breadcrumbs() {
  const crumbs = useDrive((s) => s.breadcrumbs)
  return (
    <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-sm">
      {crumbs.map((c, i) => (
        <div key={c.id} className="flex min-w-0 items-center gap-1">
          {i > 0 && <CaretRightIcon size={12} className="shrink-0" />}
          <Link
            to={`/drive/${c.id}`}
            className="hover:text-foreground hover:underline truncate max-w-30 md:max-w-55"
          >
            {c.name}
          </Link>
        </div>
      ))}
    </div>
  )
}
