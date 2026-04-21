import { useEffect, useRef, useState } from "react"
import {
  UploadIcon,
  FolderPlusIcon,
  SquaresFourIcon,
  ListBulletsIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowsDownUpIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  CheckIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { useDrive, type SortKey } from "@/store/drive"
import { NewFolderDialog } from "./NewFolderDialog"

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  size: "Size",
  modified: "Modified",
  type: "Type",
}

export function Toolbar() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)
  const {
    view,
    setView,
    showHidden,
    toggleHidden,
    createFolder,
    upload,
    sort,
    setSort,
  } = useDrive()

  useEffect(() => {
    if (!sortOpen) return
    const h = (e: MouseEvent) => {
      if (!sortRef.current?.contains(e.target as Node)) setSortOpen(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [sortOpen])

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
        <div ref={sortRef} className="relative">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSortOpen((v) => !v)}
            title={`Sort by ${SORT_LABELS[sort.key]} (${sort.dir})`}
          >
            <ArrowsDownUpIcon size={14} />
            {SORT_LABELS[sort.key]}
            {sort.dir === "asc" ? (
              <SortAscendingIcon size={12} className="opacity-70" />
            ) : (
              <SortDescendingIcon size={12} className="opacity-70" />
            )}
          </Button>
          {sortOpen && (
            <div className="bg-popover animate-in fade-in slide-in-from-top-1 absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-xl border p-1 text-sm shadow-xl duration-150">
              <div className="text-muted-foreground px-2 py-1 text-[10px] font-semibold uppercase tracking-wider">
                Sort by
              </div>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => {
                const selected = sort.key === k
                return (
                  <button
                    key={k}
                    onClick={() => {
                      setSort({ key: k, dir: sort.dir })
                      setSortOpen(false)
                    }}
                    className={`hover:bg-accent flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors ${
                      selected ? "bg-accent/60 font-medium" : ""
                    }`}
                  >
                    <span>{SORT_LABELS[k]}</span>
                    {selected && <CheckIcon size={12} weight="bold" />}
                  </button>
                )
              })}
              <div className="my-1 border-t" />
              <button
                onClick={() => {
                  setSort({ key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" })
                }}
                className="hover:bg-accent flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors"
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
              </button>
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant={showHidden ? "default" : "ghost"}
          onClick={toggleHidden}
          title="Toggle hidden"
        >
          {showHidden ? <EyeIcon size={16} /> : <EyeSlashIcon size={16} />}
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
