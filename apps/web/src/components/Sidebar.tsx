import { Link, useLocation } from "react-router-dom"
import {
  HouseIcon,
  UsersThreeIcon,
  PlusIcon,
} from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import { useAuth } from "@/store/auth"
import { useDrive } from "@/store/drive"
import { Button } from "@workspace/ui/components/button"

export function Sidebar() {
  const user = useAuth((s) => s.user)
  const { spaces, loadSpaces, createSpace } = useDrive()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const loc = useLocation()

  useEffect(() => {
    void loadSpaces()
  }, [loadSpaces])

  const navItem = (to: string, label: string, icon: React.ReactNode) => (
    <Link
      to={to}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
        loc.pathname === to
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )

  return (
    <aside className="bg-card w-64 shrink-0 border-r p-3 flex flex-col gap-4 h-screen">
      <div className="flex items-center gap-2 px-2 py-3">
        <div className="bg-primary text-primary-foreground rounded-md w-8 h-8 grid place-items-center font-bold">
          D
        </div>
        <div className="font-semibold tracking-tight">DarkDrive</div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {user && navItem(`/drive/${user.rootFolderId}`, "My Drive", <HouseIcon size={18} />)}
      </nav>

      <div className="mt-2">
        <div className="flex items-center justify-between px-2">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider">
            <UsersThreeIcon size={14} /> Spaces
          </div>
          <button
            className="hover:bg-accent rounded-md p-1"
            onClick={() => setCreating((v) => !v)}
            title="New space"
          >
            <PlusIcon size={14} />
          </button>
        </div>

        {creating && (
          <div className="mt-1 flex gap-1 px-2">
            <input
              className="bg-background border-input ring-offset-background focus-visible:ring-ring flex-1 rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
              placeholder="Space name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && name.trim()) {
                  await createSpace(name.trim())
                  setName("")
                  setCreating(false)
                }
                if (e.key === "Escape") setCreating(false)
              }}
              autoFocus
            />
          </div>
        )}

        <div className="mt-1 flex flex-col">
          {spaces.map((s) => (
            <Link
              key={s.id}
              to={`/drive/${s.rootFolderId}`}
              className="hover:bg-accent/60 text-muted-foreground hover:text-foreground truncate rounded-md px-3 py-1.5 text-sm"
              title={s.name}
            >
              {s.name}{" "}
              <span className="text-muted-foreground text-xs">({s.members.length})</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t pt-3">
        {user?.avatarUrl && (
          <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{user?.name}</div>
          <div className="text-muted-foreground truncate text-xs">{user?.email}</div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => useAuth.getState().logout()}
          title="Logout"
        >
          ⏻
        </Button>
      </div>
    </aside>
  )
}
