import { useRef, useState } from "react"
import {
  UploadIcon,
  FolderPlusIcon,
  SquaresFourIcon,
  ListBulletsIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { useDrive } from "@/store/drive"
import { NewFolderDialog } from "./NewFolderDialog"

export function Toolbar() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const {
    view,
    setView,
    showHidden,
    toggleHidden,
    showTrashed,
    toggleTrashed,
    createFolder,
    upload,
  } = useDrive()

  return (
    <div className="flex flex-1 items-center gap-2">
      <Button size="sm" onClick={() => fileInput.current?.click()}>
        <UploadIcon size={16} />
        Upload
      </Button>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
      <Button size="sm" variant="outline" onClick={() => setNewFolderOpen(true)}>
        <FolderPlusIcon size={16} />
        New folder
      </Button>
      <NewFolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onSubmit={(name, color) => createFolder(name, color)}
      />

      <div className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          variant={showHidden ? "default" : "ghost"}
          onClick={toggleHidden}
          title="Toggle hidden"
        >
          {showHidden ? <EyeIcon size={16} /> : <EyeSlashIcon size={16} />}
        </Button>
        <Button
          size="sm"
          variant={showTrashed ? "default" : "ghost"}
          onClick={toggleTrashed}
          title="Show trash"
        >
          <TrashIcon size={16} />
        </Button>
        <div className="bg-border mx-1 h-5 w-px" />
        <Button
          size="sm"
          variant={view === "grid" ? "default" : "ghost"}
          onClick={() => setView("grid")}
          title="Grid view"
        >
          <SquaresFourIcon size={16} />
        </Button>
        <Button
          size="sm"
          variant={view === "list" ? "default" : "ghost"}
          onClick={() => setView("list")}
          title="List view"
        >
          <ListBulletsIcon size={16} />
        </Button>
      </div>
    </div>
  )
}
