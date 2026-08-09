import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  UploadIcon,
  FolderPlusIcon,
  FolderOpenIcon,
  SquaresFourIcon,
  ListBulletsIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowsDownUpIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  MagnifyingGlassIcon,
  LinkSimpleIcon,
  LinkIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { useDrive, type SortKey } from "@/store/drive"
import { NewFolderDialog } from "./NewFolderDialog"
import { ImportUrlDialog } from "./ImportUrlDialog"
import { LinkFilesDialog } from "./LinkFilesDialog"

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  size: "Size",
  modified: "Modified",
  type: "Type",
}

export function Toolbar() {
  const nav = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [importUrlOpen, setImportUrlOpen] = useState(false)
  const [linkFilesOpen, setLinkFilesOpen] = useState(false)
  const {
    view,
    setView,
    showHidden,
    toggleHidden,
    createFolder,
    upload,
    importUrl,
    sort,
    setSort,
    currentFolderId,
    folder,
    refresh,
  } = useDrive()

  return (
    <div className="flex flex-1 items-center gap-2">
      <Button size="sm" onClick={() => fileInput.current?.click()}>
        <UploadIcon size={16} />
        <span className="hidden md:inline">Upload</span>
      </Button>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files)
          e.target.value = ""
        }}
      />
      <Button size="sm" variant="outline" onClick={() => folderInput.current?.click()}>
        <FolderOpenIcon size={16} />
        <span className="hidden md:inline">Upload folder</span>
      </Button>
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        // Non-standard attributes (unsupported by React's input typings) that
        // switch the native picker to folder-selection mode in Chromium/Firefox.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files)
          e.target.value = ""
        }}
      />
      <Button size="sm" variant="outline" onClick={() => setNewFolderOpen(true)}>
        <FolderPlusIcon size={16} />
        <span className="hidden md:inline">New folder</span>
      </Button>
      <NewFolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onSubmit={(name, color, thumbnail) => createFolder(name, color, thumbnail)}
      />
      <Button size="sm" variant="outline" onClick={() => setImportUrlOpen(true)}>
        <LinkSimpleIcon size={16} />
        <span className="hidden md:inline">Import from URL</span>
      </Button>
      <ImportUrlDialog
        open={importUrlOpen}
        onClose={() => setImportUrlOpen(false)}
        onSubmit={(url, name) => importUrl(url, name)}
      />
      {folder?.spaceId && currentFolderId && (
        <>
          <Button size="sm" variant="outline" onClick={() => setLinkFilesOpen(true)}>
            <LinkIcon size={16} />
            <span className="hidden md:inline">Link</span>
          </Button>
          <LinkFilesDialog
            open={linkFilesOpen}
            targetFolderId={currentFolderId}
            displayName={folder.name}
            onClose={() => setLinkFilesOpen(false)}
            onLinked={() => void refresh()}
          />
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            nav(currentFolderId ? `/search?folderId=${currentFolderId}` : "/search")
          }
          title="Search in this folder"
        >
          <MagnifyingGlassIcon size={16} />
        </Button>
        <div className="bg-border mx-1 hidden h-5 w-px md:block" />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="sm"
                variant="ghost"
                title={`Sort by ${SORT_LABELS[sort.key]} (${sort.dir})`}
              >
                <ArrowsDownUpIcon size={14} />
                <span className="hidden md:inline">{SORT_LABELS[sort.key]}</span>
                {sort.dir === "asc" ? (
                  <SortAscendingIcon size={12} className="hidden opacity-70 md:inline" />
                ) : (
                  <SortDescendingIcon size={12} className="hidden opacity-70 md:inline" />
                )}
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <DropdownMenuCheckboxItem
                key={k}
                checked={sort.key === k}
                onClick={() => setSort({ key: k, dir: sort.dir })}
              >
                {SORT_LABELS[k]}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              closeOnClick={false}
              className="justify-between"
              onClick={() =>
                setSort({ key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" })
              }
            >
              <span className="flex items-center gap-1.5">
                {sort.dir === "asc" ? (
                  <SortAscendingIcon size={14} />
                ) : (
                  <SortDescendingIcon size={14} />
                )}
                {sort.dir === "asc" ? "Ascending" : "Descending"}
              </span>
              <span className="text-muted-foreground text-[11px]">click to flip</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          variant={showHidden ? "default" : "ghost"}
          onClick={toggleHidden}
          title="Toggle hidden"
        >
          {showHidden ? <EyeIcon size={16} /> : <EyeSlashIcon size={16} />}
        </Button>
        <div className="bg-border mx-1 hidden h-5 w-px md:block" />
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
