import {
  FileIcon,
  ImageIcon,
  FileVideoIcon,
  FileAudioIcon,
  FilePdfIcon,
  FileZipIcon,
  FileTextIcon,
} from "@phosphor-icons/react"

export function iconFor(mime: string, size = 28) {
  if (mime.startsWith("image/")) return <ImageIcon size={size} weight="fill" />
  if (mime.startsWith("video/")) return <FileVideoIcon size={size} weight="fill" />
  if (mime.startsWith("audio/")) return <FileAudioIcon size={size} weight="fill" />
  if (mime === "application/pdf") return <FilePdfIcon size={size} weight="fill" />
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("rar"))
    return <FileZipIcon size={size} weight="fill" />
  if (mime.startsWith("text/")) return <FileTextIcon size={size} weight="fill" />
  return <FileIcon size={size} weight="fill" />
}
