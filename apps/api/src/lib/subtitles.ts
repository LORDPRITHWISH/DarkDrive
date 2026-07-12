import path from "node:path"

const SUBTITLE_EXTS = new Set([".vtt", ".srt"])

// Common language hints found in sidecar names (Movie.en.srt, Movie.eng.srt,
// Movie.english.srt). Maps to a BCP-47-ish code for the <track srclang>.
const LANG_CODES: Record<string, string> = {
  en: "en",
  eng: "en",
  english: "en",
  es: "es",
  spa: "es",
  spanish: "es",
  fr: "fr",
  fra: "fr",
  fre: "fr",
  french: "fr",
  de: "de",
  ger: "de",
  deu: "de",
  german: "de",
  it: "it",
  ita: "it",
  italian: "it",
  pt: "pt",
  por: "pt",
  portuguese: "pt",
  ru: "ru",
  rus: "ru",
  russian: "ru",
  ja: "ja",
  jpn: "ja",
  japanese: "ja",
  ko: "ko",
  kor: "ko",
  korean: "ko",
  zh: "zh",
  chi: "zh",
  zho: "zh",
  chinese: "zh",
  hi: "hi",
  hin: "hi",
  hindi: "hi",
  ar: "ar",
  ara: "ar",
  arabic: "ar",
}

export function isSubtitleFile(name: string): boolean {
  return SUBTITLE_EXTS.has(path.extname(name).toLowerCase())
}

function baseName(name: string): string {
  return name.slice(0, name.length - path.extname(name).length)
}

export type SubtitleSibling = {
  id: string
  label: string
  lang: string | null
}

// Given a video's name and the other files in its folder, returns the subtitle
// siblings that belong to it. A subtitle matches when its base name equals the
// video's base name, optionally followed by a language/label suffix:
//   video: "The Movie (2021).mkv"
//   match: "The Movie (2021).srt", "The Movie (2021).en.srt",
//          "The Movie (2021).English.vtt"
export function listSubtitleSiblings(
  videoName: string,
  siblings: { id: string; name: string }[]
): SubtitleSibling[] {
  const videoBase = baseName(videoName).toLowerCase()
  const out: SubtitleSibling[] = []

  for (const sib of siblings) {
    if (!isSubtitleFile(sib.name)) continue
    const sibBase = baseName(sib.name)
    const sibBaseLower = sibBase.toLowerCase()

    if (sibBaseLower !== videoBase && !sibBaseLower.startsWith(`${videoBase}.`)) {
      continue
    }

    // The part after the matched video base becomes the language/label hint.
    const suffix =
      sibBaseLower === videoBase ? "" : sibBase.slice(videoBase.length + 1)
    const { label, lang } = describeSuffix(suffix)
    out.push({ id: sib.id, label, lang })
  }

  // Stable, human order: named/known tracks first by label.
  out.sort((a, b) => a.label.localeCompare(b.label))
  return out
}

function describeSuffix(suffix: string): { label: string; lang: string | null } {
  const trimmed = suffix.trim()
  if (!trimmed) return { label: "Subtitles", lang: null }

  // A suffix may carry several dot-separated tags (e.g. "en.forced",
  // "english.sdh"). Use the first recognized language for srclang and keep the
  // full suffix (prettified) as the visible label.
  const parts = trimmed.split(/[.\-_ ]+/).filter(Boolean)
  let lang: string | null = null
  for (const p of parts) {
    const code = LANG_CODES[p.toLowerCase()]
    if (code) {
      lang = code
      break
    }
  }
  const label = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
  return { label: label || "Subtitles", lang }
}

// Converts subtitle text to WebVTT. SRT is the common sidecar format and is
// nearly VTT already — the differences are the cue-time separator (comma vs
// dot) and the required `WEBVTT` header. Existing VTT is passed through after
// header/BOM normalization.
export function toVtt(raw: string, name: string): string {
  const ext = path.extname(name).toLowerCase()
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n")

  if (ext === ".vtt") {
    return /^\s*WEBVTT/.test(text) ? text : `WEBVTT\n\n${text.trimStart()}`
  }

  // SRT → VTT: fix millisecond separators in cue timings.
  const body = text.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    "$1.$2"
  )
  return `WEBVTT\n\n${body.trim()}\n`
}
