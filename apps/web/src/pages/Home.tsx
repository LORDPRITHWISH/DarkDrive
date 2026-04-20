import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { FolderIcon, StarIcon } from "@phosphor-icons/react"
import { useAuth } from "@/store/auth"
import { useMe } from "@/store/me"
import { Sidebar } from "@/components/Sidebar"
import { FilePreview } from "@/components/FilePreview"
import { formatBytes, formatDate } from "@/lib/format"
import { apiUrl } from "@/lib/config"
import { iconFor } from "@/lib/fileIcon"
import type { FileItem } from "@/lib/types"

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return "Up late"
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

export function HomePage() {
  const user = useAuth((s) => s.user)
  const {
    suggestions,
    folderSuggestions,
    recent,
    recentlyAdded,
    loadSuggestions,
    loadFolderSuggestions,
    loadRecent,
    loadRecentlyAdded,
    dismissRecentlyAdded,
    pushNav,
  } = useMe()
  const [preview, setPreview] = useState<FileItem | null>(null)
  const navigate = useNavigate()

  // Open a folder from Home by first priming the drive history with My Drive
  // root so pressing Back inside the folder returns to the drive, not Home.
  async function openFolder(folderId: string) {
    if (user?.rootFolderId && user.rootFolderId !== folderId) {
      await pushNav(`/drive/${user.rootFolderId}`)
    }
    navigate(`/drive/${folderId}`)
  }

  useEffect(() => {
    void loadSuggestions(12)
    void loadFolderSuggestions(8)
    void loadRecent(8)
    void loadRecentlyAdded(12)
  }, [loadSuggestions, loadFolderSuggestions, loadRecent, loadRecentlyAdded])

  function openFile(f: FileItem) {
    // Optimistically remove from "Recently added" — opening hits
    // /download?inline=1 which writes a FileAccess row, so subsequent
    // loads will also exclude it.
    dismissRecentlyAdded(f.id)
    setPreview(f)
  }

  const firstName = user?.name?.split(" ")[0] ?? ""

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <div className="text-sm font-semibold">Home</div>
        </header>
        <div className="flex-1 overflow-auto px-6 py-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {greeting()}
              {firstName && `, ${firstName}`}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Welcome back to DarkDrive.
            </p>

            {recentlyAdded.length > 0 && (
              <section className="mt-8">
                <div className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider">
                  Recently added
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                  {recentlyAdded.map((f) => {
                    const isImg = f.mimeType.startsWith("image/")
                    return (
                      <button
                        key={f.id}
                        onClick={() => openFile(f)}
                        className="bg-card hover:border-primary/60 group relative overflow-hidden rounded-lg border text-left transition-colors"
                      >
                        <span className="bg-primary text-primary-foreground absolute top-2 left-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                          New
                        </span>
                        <div className="bg-muted grid aspect-4/3 place-items-center overflow-hidden">
                          {isImg ? (
                            <img
                              src={apiUrl(`/api/files/${f.id}/download?inline=1`)}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            iconFor(f.mimeType, 56, f.name)
                          )}
                        </div>
                        <div className="p-2">
                          <div className="truncate text-sm font-medium" title={f.name}>
                            {f.name}
                          </div>
                          <div className="text-muted-foreground flex items-center justify-between text-xs">
                            <span>{formatBytes(f.size)}</span>
                            <span>{formatDate(f.createdAt)}</span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {folderSuggestions.length > 0 && (
              <section className="mt-8">
                <div className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider">
                  Suggested folders
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                  {folderSuggestions.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => void openFolder(f.id)}
                      className="bg-card hover:border-primary/60 flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors"
                    >
                      <FolderIcon
                        size={28}
                        weight="fill"
                        style={{ color: f.color || undefined }}
                        className={f.color ? "" : "text-primary"}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium" title={f.name}>
                          {f.name}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {formatDate(f.updatedAt)}
                        </div>
                      </div>
                      {f.isStarred && (
                        <StarIcon size={14} weight="fill" className="text-yellow-500" />
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {suggestions.length > 0 && (
              <section className="mt-8">
                <div className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider">
                  Suggested files
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                  {suggestions.map((f) => {
                    const isImg = f.mimeType.startsWith("image/")
                    return (
                      <button
                        key={f.id}
                        onClick={() => setPreview(f)}
                        className="bg-card hover:border-primary/60 overflow-hidden rounded-lg border text-left transition-colors"
                      >
                        <div className="bg-muted grid aspect-4/3 place-items-center overflow-hidden">
                          {isImg ? (
                            <img
                              src={apiUrl(`/api/files/${f.id}/download?inline=1`)}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            iconFor(f.mimeType, 56, f.name)
                          )}
                        </div>
                        <div className="p-2">
                          <div className="truncate text-sm font-medium" title={f.name}>
                            {f.name}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {formatBytes(f.size)}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {recent.length > 0 && (
              <section className="mt-8">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                    Frequently visited
                  </div>
                  <Link
                    to="/recent"
                    className="text-primary text-xs hover:underline"
                  >
                    View all
                  </Link>
                </div>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <tbody>
                      {recent.map((f) => (
                        <tr
                          key={f.id}
                          className="hover:bg-accent/40 cursor-pointer border-b last:border-b-0"
                          onClick={() => setPreview(f)}
                        >
                          <td className="py-2 pl-3">
                            <div className="flex items-center gap-2">
                              {iconFor(f.mimeType, 18, f.name)}
                              <span className="truncate">{f.name}</span>
                            </div>
                          </td>
                          <td className="text-muted-foreground py-2 pr-3 text-right text-xs">
                            {formatDate(f.accessedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {folderSuggestions.length === 0 &&
              suggestions.length === 0 &&
              recent.length === 0 &&
              recentlyAdded.length === 0 && (
                <div className="text-muted-foreground mt-10 rounded-lg border border-dashed p-10 text-center text-sm">
                  Your home is empty. Head to{" "}
                  {user && (
                    <Link
                      to={`/drive/${user.rootFolderId}`}
                      className="text-primary hover:underline"
                    >
                      My Drive
                    </Link>
                  )}{" "}
                  to upload files and they'll start showing up here.
                </div>
              )}
          </div>
        </div>
        <FilePreview file={preview} onClose={() => setPreview(null)} />
      </main>
    </div>
  )
}
