import { CaretDoubleLeftIcon, CaretDoubleRightIcon, ListIcon } from "@phosphor-icons/react"
import { useSidebar } from "@/store/sidebar"

export function SidebarToggle() {
  const { collapsed, toggle, setMobileOpen } = useSidebar()
  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        title="Open menu"
        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors md:hidden"
      >
        <ListIcon size={20} />
      </button>
      <button
        onClick={toggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors md:inline-flex"
      >
        {collapsed ? (
          <CaretDoubleRightIcon size={16} />
        ) : (
          <CaretDoubleLeftIcon size={16} />
        )}
      </button>
    </>
  )
}
