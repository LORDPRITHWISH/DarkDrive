import { apiUrl } from "./config"
import type { DragItem } from "@/components/file-grid/dnd"

// Downloads one or more files/folders. A lone file is streamed directly (no
// zip overhead, keeps its original extension); anything else — a folder, or
// a mixed/multi selection — is bundled server-side into a .zip.
//
// Posted as a hidden form (not fetch/window.open with a query string) so the
// item list isn't bounded by URL length — a large selection's JSON payload
// can run well past what browsers/proxies allow in a URL.
export function triggerDownload(items: DragItem[], displayName: string) {
  if (items.length === 0) return
  if (items.length === 1 && items[0].type === "file") {
    window.open(apiUrl(`/api/files/${items[0].id}/download`), "_blank")
    return
  }

  const form = document.createElement("form")
  form.method = "POST"
  form.action = apiUrl("/api/files/zip")
  form.target = "_blank"
  form.style.display = "none"

  const addField = (key: string, value: string) => {
    const input = document.createElement("input")
    input.type = "hidden"
    input.name = key
    input.value = value
    form.appendChild(input)
  }
  addField("items", JSON.stringify(items))
  addField("name", displayName)

  document.body.appendChild(form)
  form.submit()
  form.remove()
}
