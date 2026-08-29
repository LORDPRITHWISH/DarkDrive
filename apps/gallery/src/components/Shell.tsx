import { useEffect, useRef, useState } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import {
  ImagesSquare,
  SignOut,
  Stack,
  Star,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react"
import { useGallery } from "@/store/gallery"
import { formatBytes } from "@/lib/format"

const NAV = [
  { to: "/", label: "Photos", icon: ImagesSquare, end: true },
  { to: "/favorites", label: "Favorites", icon: Star, end: false },
  { to: "/albums", label: "Albums", icon: Stack, end: false },
  { to: "/bin", label: "Bin", icon: Trash, end: false },
]

/**
 * App frame: a thin rail of destinations, a header that stays out of the way,
 * and a whole-window drop target — dropping photos anywhere in DarkGallery
 * puts them in the library, which is the one gesture people actually use.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const { me, quota, refreshQuota, upload, uploads, logout } = useGallery()
  const nav = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  // Nested dragenter/dragleave pairs fire constantly while moving over child
  // elements; counting them is what keeps the overlay from flickering.
  const dragDepth = useRef(0)

  useEffect(() => {
    void refreshQuota()
  }, [refreshQuota])

  const pct = quota && quota.total ? Math.min(100, (quota.used / quota.total) * 100) : 0

  return (
    <div
      className="min-h-svh"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return
        dragDepth.current++
        setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        if (--dragDepth.current <= 0) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length) void upload(files)
      }}
    >
      <header className="bg-background/70 sticky top-0 z-30 flex h-14 items-center gap-3 px-3 backdrop-blur-xl sm:px-5">
        <button
          onClick={() => nav("/")}
          className="flex items-baseline gap-2 pr-2 text-left"
          title="DarkGallery"
        >
          <span className="font-serif text-lg leading-none font-semibold tracking-tight">
            Dark<span className="text-primary">Gallery</span>
          </span>
        </button>

        <nav className="ml-auto flex items-center gap-1 sm:ml-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                ].join(" ")
              }
            >
              <Icon size={17} weight="fill" />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {quota && (
            <div
              className="hidden w-36 lg:block"
              title={`${formatBytes(quota.used)} of ${formatBytes(quota.total)} used — shared with DarkDrive`}
            >
              <div className="text-muted-foreground mb-1 text-[11px] tracking-wide tabular-nums">
                {formatBytes(quota.used)} / {formatBytes(quota.total)}
              </div>
              <div className="bg-card h-1 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={() => fileInput.current?.click()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors"
          >
            <UploadSimple size={16} weight="bold" />
            <span className="hidden sm:inline">Upload</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ""
              if (files.length) void upload(files)
            }}
          />

          <button
            onClick={async () => {
              await logout()
              nav("/")
            }}
            title={me ? `${me.name} — sign out` : "Sign out"}
            className="text-muted-foreground hover:text-foreground grid size-9 place-items-center rounded-full transition-colors"
          >
            {me?.avatarUrl ? (
              <img src={me.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
            ) : (
              <SignOut size={18} />
            )}
          </button>
        </div>
      </header>

      {children}

      <UploadStrip uploads={uploads} />

      {dragging && (
        <div className="border-primary/70 bg-background/80 pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-2xl border-2 border-dashed backdrop-blur-sm">
          <div className="text-center">
            <UploadSimple size={40} weight="light" className="text-primary mx-auto mb-3" />
            <p className="font-serif text-xl">Drop to add to your library</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Stored in DarkDrive, under My Photos
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function UploadStrip({ uploads }: { uploads: ReturnType<typeof useGallery.getState>["uploads"] }) {
  if (!uploads.length) return null
  const total = uploads.reduce((n, u) => n + u.size, 0)
  const sent = uploads.reduce((n, u) => n + u.sent, 0)
  const failed = uploads.filter((u) => u.error)

  return (
    <div className="bg-card/95 fixed right-4 bottom-4 z-40 w-72 rounded-xl border p-3 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span>
          {failed.length ? `${failed.length} failed` : `Uploading ${uploads.length}`}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatBytes(sent)} / {formatBytes(total)}
        </span>
      </div>
      <div className="bg-background h-1 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full transition-[width]"
          style={{ width: `${total ? (sent / total) * 100 : 0}%` }}
        />
      </div>
      {failed.length > 0 && (
        <ul className="text-destructive mt-2 max-h-20 space-y-0.5 overflow-auto text-xs">
          {failed.map((u) => (
            <li key={u.id} className="truncate">
              {u.name} — {u.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
