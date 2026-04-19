import {
  FileArchiveIcon,
  FileAudioIcon,
  FileCIcon,
  FileCodeIcon,
  FileCppIcon,
  FileCSharpIcon,
  FileCssIcon,
  FileCsvIcon,
  FileDocIcon,
  FileHtmlIcon,
  FileIcon,
  FileImageIcon,
  FileIniIcon,
  FileJpgIcon,
  FileJsIcon,
  FileJsxIcon,
  FileMdIcon,
  FilePdfIcon,
  FilePngIcon,
  FilePptIcon,
  FilePyIcon,
  FileRsIcon,
  FileSqlIcon,
  FileSvgIcon,
  FileTextIcon,
  FileTsIcon,
  FileTsxIcon,
  FileTxtIcon,
  FileVideoIcon,
  FileVueIcon,
  FileXlsIcon,
  FileZipIcon,
} from "@phosphor-icons/react"
import type { ComponentType } from "react"

type IconComp = ComponentType<{
  size?: number | string
  weight?: "fill" | "regular" | "duotone" | "thin" | "light" | "bold"
  className?: string
}>

// Phosphor file icons + a fitting brand-ish color per known type.
// Matched by extension first (more specific) then by mime prefix.
type Spec = { Icon: IconComp; color: string }

const BY_EXT: Record<string, Spec> = {
  // docs
  pdf: { Icon: FilePdfIcon, color: "text-rose-500" },
  doc: { Icon: FileDocIcon, color: "text-blue-500" },
  docx: { Icon: FileDocIcon, color: "text-blue-500" },
  xls: { Icon: FileXlsIcon, color: "text-emerald-600" },
  xlsx: { Icon: FileXlsIcon, color: "text-emerald-600" },
  ppt: { Icon: FilePptIcon, color: "text-orange-500" },
  pptx: { Icon: FilePptIcon, color: "text-orange-500" },
  csv: { Icon: FileCsvIcon, color: "text-emerald-500" },
  tsv: { Icon: FileCsvIcon, color: "text-emerald-500" },
  md: { Icon: FileMdIcon, color: "text-slate-400" },
  txt: { Icon: FileTxtIcon, color: "text-slate-400" },
  rtf: { Icon: FileTextIcon, color: "text-slate-400" },
  // archives
  zip: { Icon: FileZipIcon, color: "text-amber-500" },
  rar: { Icon: FileArchiveIcon, color: "text-amber-600" },
  "7z": { Icon: FileArchiveIcon, color: "text-amber-600" },
  tar: { Icon: FileArchiveIcon, color: "text-amber-600" },
  gz: { Icon: FileArchiveIcon, color: "text-amber-600" },
  bz2: { Icon: FileArchiveIcon, color: "text-amber-600" },
  xz: { Icon: FileArchiveIcon, color: "text-amber-600" },
  // code
  json: { Icon: FileCodeIcon, color: "text-amber-400" },
  js: { Icon: FileJsIcon, color: "text-yellow-400" },
  mjs: { Icon: FileJsIcon, color: "text-yellow-400" },
  cjs: { Icon: FileJsIcon, color: "text-yellow-400" },
  jsx: { Icon: FileJsxIcon, color: "text-cyan-400" },
  ts: { Icon: FileTsIcon, color: "text-sky-500" },
  tsx: { Icon: FileTsxIcon, color: "text-sky-400" },
  html: { Icon: FileHtmlIcon, color: "text-orange-500" },
  htm: { Icon: FileHtmlIcon, color: "text-orange-500" },
  css: { Icon: FileCssIcon, color: "text-sky-500" },
  scss: { Icon: FileCssIcon, color: "text-pink-500" },
  less: { Icon: FileCssIcon, color: "text-sky-400" },
  py: { Icon: FilePyIcon, color: "text-sky-600" },
  rs: { Icon: FileRsIcon, color: "text-orange-600" },
  c: { Icon: FileCIcon, color: "text-blue-400" },
  h: { Icon: FileCIcon, color: "text-blue-400" },
  cpp: { Icon: FileCppIcon, color: "text-blue-600" },
  hpp: { Icon: FileCppIcon, color: "text-blue-600" },
  cs: { Icon: FileCSharpIcon, color: "text-violet-500" },
  vue: { Icon: FileVueIcon, color: "text-emerald-500" },
  sql: { Icon: FileSqlIcon, color: "text-violet-600" },
  ini: { Icon: FileIniIcon, color: "text-slate-400" },
  conf: { Icon: FileIniIcon, color: "text-slate-400" },
  env: { Icon: FileIniIcon, color: "text-amber-500" },
  toml: { Icon: FileIniIcon, color: "text-slate-400" },
  yaml: { Icon: FileCodeIcon, color: "text-rose-400" },
  yml: { Icon: FileCodeIcon, color: "text-rose-400" },
  sh: { Icon: FileCodeIcon, color: "text-emerald-400" },
  bash: { Icon: FileCodeIcon, color: "text-emerald-400" },
  zsh: { Icon: FileCodeIcon, color: "text-emerald-400" },
  go: { Icon: FileCodeIcon, color: "text-cyan-400" },
  java: { Icon: FileCodeIcon, color: "text-red-500" },
  rb: { Icon: FileCodeIcon, color: "text-red-500" },
  php: { Icon: FileCodeIcon, color: "text-violet-400" },
  // images
  svg: { Icon: FileSvgIcon, color: "text-amber-500" },
  png: { Icon: FilePngIcon, color: "text-emerald-500" },
  jpg: { Icon: FileJpgIcon, color: "text-emerald-500" },
  jpeg: { Icon: FileJpgIcon, color: "text-emerald-500" },
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".")
  if (dot < 0 || dot === name.length - 1) return ""
  return name.slice(dot + 1).toLowerCase()
}

function specFor(mime: string, name?: string): Spec {
  if (name) {
    const ext = extOf(name)
    const byExt = BY_EXT[ext]
    if (byExt) return byExt
  }
  if (mime.startsWith("image/"))
    return { Icon: FileImageIcon, color: "text-emerald-500" }
  if (mime.startsWith("video/"))
    return { Icon: FileVideoIcon, color: "text-sky-500" }
  if (mime.startsWith("audio/"))
    return { Icon: FileAudioIcon, color: "text-violet-500" }
  if (mime === "application/pdf")
    return { Icon: FilePdfIcon, color: "text-rose-500" }
  if (mime === "application/json")
    return { Icon: FileCodeIcon, color: "text-amber-400" }
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("rar"))
    return { Icon: FileArchiveIcon, color: "text-amber-500" }
  if (mime.includes("msword") || mime.includes("wordprocessingml"))
    return { Icon: FileDocIcon, color: "text-blue-500" }
  if (mime.includes("ms-excel") || mime.includes("spreadsheetml"))
    return { Icon: FileXlsIcon, color: "text-emerald-600" }
  if (mime.includes("ms-powerpoint") || mime.includes("presentationml"))
    return { Icon: FilePptIcon, color: "text-orange-500" }
  if (mime === "text/csv")
    return { Icon: FileCsvIcon, color: "text-emerald-500" }
  if (mime.startsWith("text/"))
    return { Icon: FileTextIcon, color: "text-slate-400" }
  return { Icon: FileIcon, color: "text-muted-foreground" }
}

export function iconFor(mime: string, size = 28, name?: string) {
  const { Icon, color } = specFor(mime, name)
  return <Icon size={size} weight="fill" className={color} />
}
