"use client"

import "@videojs/react/video/skin.css"
import "./dark-player.css"
import { createPlayer, videoFeatures } from "@videojs/react"
import { VideoSkin, Video } from "@videojs/react/video"
import { forwardRef, useEffect, useRef, useState } from "react"
import {
  GearIcon,
  CheckIcon,
  ClosedCaptioningIcon,
  SpeakerHighIcon,
} from "@phosphor-icons/react"
import type { SubtitleTrack } from "@/lib/types"

const Player = createPlayer({ features: videoFeatures })

// AudioTrack / AudioTrackList were dropped from TS's DOM lib (no full browser
// support), so we declare the minimal shape we touch. Present mainly in Safari.
interface AudioTrackLike {
  readonly id: string
  readonly label: string
  readonly language: string
  enabled: boolean
}
interface AudioTrackListLike extends EventTarget {
  readonly length: number
  [index: number]: AudioTrackLike
}
type VideoWithAudioTracks = HTMLVideoElement & {
  audioTracks?: AudioTrackListLike
}

// DOM-mutating helpers kept at module scope: they operate on the element passed
// in, not on a ref/prop captured in a component body, so they're outside the
// React compiler's immutability checks.
function applyTextTrack(video: HTMLVideoElement, index: number) {
  const list = video.textTracks
  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    if (t.kind !== "subtitles" && t.kind !== "captions") continue
    t.mode = i === index ? "showing" : "disabled"
  }
}

function applyAudioTrack(video: HTMLVideoElement, index: number) {
  const audioList = (video as VideoWithAudioTracks).audioTracks
  if (!audioList) return
  for (let i = 0; i < audioList.length; i++) {
    audioList[i].enabled = i === index
  }
}

interface DarkPlayerProps {
  src: string
  className?: string
  /** Sidecar subtitle tracks to attach as <track> elements. */
  tracks?: SubtitleTrack[]
  autoPlay?: boolean
}

export const DarkPlayer = forwardRef<HTMLVideoElement, DarkPlayerProps>(
  ({ src, className, tracks = [], autoPlay }, ref) => {
    const videoRef = useRef<HTMLVideoElement | null>(null)

    const attachRef = (el: HTMLVideoElement | null) => {
      videoRef.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    }

    if (!src) {
      return (
        <div className="dark-player-wrapper">
          <div className="dark-player-loading">
            <div className="dark-player-loading__spinner" />
          </div>
        </div>
      )
    }

    return (
      <div className={`dark-player-wrapper ${className || ""} `}>
        <Player.Provider>
          <Player.Container>
            <VideoSkin>
              <Video
                ref={attachRef}
                src={src}
                className="h-full w-full object-contain"
                playsInline
                autoPlay={autoPlay}
              >
                {tracks.map((t) => (
                  <track
                    key={t.id}
                    kind="subtitles"
                    src={t.src}
                    srcLang={t.lang ?? undefined}
                    label={t.label}
                  />
                ))}
              </Video>
            </VideoSkin>
            <TrackSettings videoRef={videoRef} subtitleCount={tracks.length} />
          </Player.Container>
        </Player.Provider>
      </div>
    )
  }
)

DarkPlayer.displayName = "DarkPlayer"

type TextTrackOption = { index: number; label: string; active: boolean }
type AudioTrackOption = { index: number; label: string; active: boolean }

// Floating gear menu for picking the subtitle track and (when the browser
// exposes more than one) the audio track. It drives the native TextTrackList /
// AudioTrackList on the underlying <video>, so selection works regardless of
// what the video.js skin chooses to render. Rendered inside the fullscreen
// container so it stays available in fullscreen.
function TrackSettings({
  videoRef,
  subtitleCount,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  subtitleCount: number
}) {
  const [open, setOpen] = useState(false)
  const [textTracks, setTextTracks] = useState<TextTrackOption[]>([])
  const [audioTracks, setAudioTracks] = useState<AudioTrackOption[]>([])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const isCaptionLike = (t: TextTrack) =>
      t.kind === "subtitles" || t.kind === "captions"

    const syncText = () => {
      const list = video.textTracks
      const opts: TextTrackOption[] = []
      for (let i = 0; i < list.length; i++) {
        const t = list[i]
        if (!isCaptionLike(t)) continue
        opts.push({
          index: i,
          label: t.label || t.language?.toUpperCase() || `Track ${i + 1}`,
          active: t.mode === "showing",
        })
      }
      setTextTracks(opts)
    }

    // AudioTrackList is non-standard and only present in some browsers
    // (notably Safari). When absent or single-track, no audio menu is shown.
    const audioList = (video as VideoWithAudioTracks).audioTracks
    const syncAudio = () => {
      if (!audioList || audioList.length <= 1) {
        setAudioTracks([])
        return
      }
      const opts: AudioTrackOption[] = []
      for (let i = 0; i < audioList.length; i++) {
        const a = audioList[i]
        opts.push({
          index: i,
          label: a.label || a.language?.toUpperCase() || `Audio ${i + 1}`,
          active: a.enabled,
        })
      }
      setAudioTracks(opts)
    }

    syncText()
    syncAudio()

    const textList = video.textTracks
    textList.addEventListener("addtrack", syncText)
    textList.addEventListener("removetrack", syncText)
    textList.addEventListener("change", syncText)
    audioList?.addEventListener("addtrack", syncAudio)
    audioList?.addEventListener("removetrack", syncAudio)
    audioList?.addEventListener("change", syncAudio)
    video.addEventListener("loadedmetadata", syncAudio)

    return () => {
      textList.removeEventListener("addtrack", syncText)
      textList.removeEventListener("removetrack", syncText)
      textList.removeEventListener("change", syncText)
      audioList?.removeEventListener("addtrack", syncAudio)
      audioList?.removeEventListener("removetrack", syncAudio)
      audioList?.removeEventListener("change", syncAudio)
      video.removeEventListener("loadedmetadata", syncAudio)
    }
  }, [videoRef, subtitleCount])

  const selectText = (index: number) => {
    const video = videoRef.current
    if (video) applyTextTrack(video, index)
  }

  const selectAudio = (index: number) => {
    const video = videoRef.current
    if (!video) return
    applyAudioTrack(video, index)
    // AudioTrackList doesn't reliably fire `change` on programmatic toggles.
    setAudioTracks((prev) =>
      prev.map((o) => ({ ...o, active: o.index === index }))
    )
  }

  const hasSubtitles = subtitleCount > 0 || textTracks.length > 0
  const hasAudioChoice = audioTracks.length > 1
  if (!hasSubtitles && !hasAudioChoice) return null

  const subtitlesOff = !textTracks.some((t) => t.active)

  return (
    <div className="dark-track-settings">
      {open && (
        <button
          type="button"
          className="dark-track-settings__scrim"
          aria-label="Close settings"
          onClick={() => setOpen(false)}
        />
      )}
      <button
        type="button"
        className="dark-track-settings__gear"
        aria-label="Subtitle and audio settings"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <GearIcon size={20} weight="fill" />
      </button>

      {open && (
        <div className="dark-track-settings__panel" role="menu">
          {hasSubtitles && (
            <section className="dark-track-settings__section">
              <div className="dark-track-settings__heading">
                <ClosedCaptioningIcon size={15} weight="fill" />
                Subtitles
              </div>
              <MenuItem
                label="Off"
                active={subtitlesOff}
                onClick={() => selectText(-1)}
              />
              {textTracks.map((t) => (
                <MenuItem
                  key={t.index}
                  label={t.label}
                  active={t.active}
                  onClick={() => selectText(t.index)}
                />
              ))}
            </section>
          )}

          {hasAudioChoice && (
            <section className="dark-track-settings__section">
              <div className="dark-track-settings__heading">
                <SpeakerHighIcon size={15} weight="fill" />
                Audio
              </div>
              {audioTracks.map((a) => (
                <MenuItem
                  key={a.index}
                  label={a.label}
                  active={a.active}
                  onClick={() => selectAudio(a.index)}
                />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      className="dark-track-settings__item"
      onClick={onClick}
    >
      <span className="dark-track-settings__check">
        {active && <CheckIcon size={14} weight="bold" />}
      </span>
      <span className="dark-track-settings__label">{label}</span>
    </button>
  )
}
