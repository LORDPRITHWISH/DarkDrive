import { Link } from "react-router-dom"
import { CaretRightIcon } from "@phosphor-icons/react"
import { useDrive } from "@/store/drive"

// The trail to the open folder. Local files hands in its own, to a folder on this computer.
export function Breadcrumbs({ trail }: { trail?: { name: string; to: string }[] }) {
  const drive = useDrive((s) => s.breadcrumbs)
  const crumbs = trail ?? drive.map((c) => ({ name: c.name, to: `/drive/${c.id}` }))
  return (
    <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-sm">
      {crumbs.map((c, i) => (
        <div key={c.to} className="flex min-w-0 items-center gap-1">
          {i > 0 && <CaretRightIcon size={12} className="shrink-0" />}
          <Link
            to={c.to}
            className="hover:text-foreground hover:underline truncate max-w-30 md:max-w-55"
          >
            {c.name}
          </Link>
        </div>
      ))}
    </div>
  )
}
