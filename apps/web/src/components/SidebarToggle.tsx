import { CaretDoubleLeftIcon, CaretDoubleRightIcon } from "@phosphor-icons/react"
import { useSidebar } from "@/store/sidebar"

export function SidebarToggle() {
  const { collapsed, toggle } = useSidebar()
  return (
    <button
      onClick={toggle}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    >
      {collapsed ? (
        <CaretDoubleRightIcon size={16} />
      ) : (
        <CaretDoubleLeftIcon size={16} />
      )}
    </button>
  )
}
