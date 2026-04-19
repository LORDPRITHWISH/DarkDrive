import { useEffect } from "react"
import { useParams } from "react-router-dom"
import { useDrive } from "@/store/drive"
import { Sidebar } from "@/components/Sidebar"
import { Toolbar } from "@/components/Toolbar"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { FileGrid } from "@/components/FileGrid"
import { UploadToaster } from "@/components/UploadToaster"
import { NavButtons } from "@/components/NavButtons"

export function DrivePage() {
  const { folderId } = useParams<{ folderId: string }>()
  const { loadFolder, upload, folder } = useDrive()

  useEffect(() => {
    if (folderId) void loadFolder(folderId)
  }, [folderId, loadFolder])

  return (
    <div
      className="flex h-screen"
      onDragOver={(e) => {
        e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        if (e.dataTransfer?.files?.length) void upload(e.dataTransfer.files)
      }}
    >
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <Breadcrumbs />
          {folder?.spaceId && (
            <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs">
              shared space
            </span>
          )}
        </header>
        <div className="flex items-center gap-3 border-b p-3">
          <NavButtons />
          <div className="bg-border h-6 w-px" />
          <Toolbar />
        </div>
        <div className="flex-1 overflow-auto">
          <FileGrid />
        </div>
        <UploadToaster />
      </main>
    </div>
  )
}
