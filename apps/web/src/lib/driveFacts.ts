import type { QuotaInfo } from "./types"

type Kind = keyof QuotaInfo["byType"]

const DVD_BYTES = 4.7e9
const FLOPPY_BYTES = 1_474_560 // the "1.44 MB" kind

// How the storage categories read mid-sentence. "other" is left out: "40% of
// your storage is other" says nothing.
const WORD: Partial<Record<Kind, string>> = {
  image: "images",
  video: "video",
  audio: "audio",
  doc: "documents",
  archive: "archives",
}

// One-line facts about a drive for Home's trivia card, worked out from the
// quota numbers alone. Empty for an empty drive.
export function driveFacts(q: QuotaInfo): string[] {
  if (q.used <= 0) return []
  const n = (v: number) => v.toLocaleString("en")

  const dvds = Math.ceil(q.used / DVD_BYTES)
  const facts = [
    dvds === 1
      ? "Your whole drive would fit on a single DVD."
      : `Burned to DVDs, your drive would be a stack of ${n(dvds)} discs.`,
    `Saved to floppy disks, it would take ${n(Math.ceil(q.used / FLOPPY_BYTES))} of them.`,
  ]

  const files = Object.values(q.byType).reduce((a, b) => a + b, 0)
  if (files === 0) return facts

  const room = Math.floor((q.total - q.used) / (q.used / files))
  if (room > 0) {
    facts.push(`You have room for about ${n(room)} more files the size of your average one.`)
  }

  // The category that takes the most space, when it's lopsided enough to be
  // worth saying: a big share of the bytes from a small share of the files.
  const top = (Object.keys(q.bytesByType) as Kind[]).reduce((a, b) =>
    q.bytesByType[b] > q.bytesByType[a] ? b : a
  )
  const ofStorage = Math.round((q.bytesByType[top] / q.used) * 100)
  const ofFiles = Math.round((q.byType[top] / files) * 100)
  if (WORD[top] && ofStorage - ofFiles >= 20) {
    facts.push(`${ofStorage}% of your storage is ${WORD[top]}, from just ${ofFiles}% of your files.`)
  }
  return facts
}
