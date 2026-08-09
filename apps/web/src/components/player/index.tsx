"use client"

import "@videojs/react/video/skin.css"
import "./dark-player.css"
import { createPlayer, videoFeatures } from "@videojs/react"
import { VideoSkin, Video } from "@videojs/react/video"
import { forwardRef, useEffect, useRef } from "react"
import type { SubtitleTrack } from "@/lib/types"

const Player = createPlayer({ features: videoFeatures })

// DOM-mutating helper kept at module scope: it operates on the element passed
// in, not on a ref/prop captured in a component body, so it's outside the
// React compiler's immutability checks. `index` counts caption-like tracks
// only (matching the order of the `tracks` prop); -1 turns subtitles off.
function applyTextTrack(video: HTMLVideoElement, index: number) {
  const list = video.textTracks
  let nth = 0
  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    if (t.kind !== "subtitles" && t.kind !== "captions") continue
    t.mode = nth === index ? "showing" : "disabled"
    nth++
  }
}

interface DarkPlayerProps {
  src: string
  className?: string
  /** Sidecar subtitle tracks to attach as <track> elements. */
  tracks?: SubtitleTrack[]
  /**
   * Index into `tracks` of the subtitle to show, or null for off. Selection
   * lives in the file's Properties panel rather than an in-player menu.
   */
  subtitleIndex?: number | null
  autoPlay?: boolean
  /** Shown before playback starts / while the source loads. */
  poster?: string
  /** Seconds to seek to once metadata loads, e.g. a saved resume position. */
  startTime?: number | null
  /**
   * WebVTT storyboard track URL for the seek bar's scrubbing preview (see
   * apps/api's /storyboard.vtt route). Omitted where none is available.
   */
  storyboardSrc?: string
  /**
   * Called with the current playback position (seconds), throttled to ~5s
   * while playing and once with 0 when the video ends. The caller decides
   * whether/how to persist it.
   */
  onProgress?: (sec: number) => void
}

// Minimum gap between onProgress calls while playing — cheap enough to not
// spam the server, coarse enough that a closed tab loses at most a few
// seconds of progress.
const PROGRESS_INTERVAL_MS = 5000

export const DarkPlayer = forwardRef<HTMLVideoElement, DarkPlayerProps>(
  (
    {
      src,
      className,
      tracks = [],
      subtitleIndex = null,
      autoPlay,
      poster,
      startTime,
      storyboardSrc,
      onProgress,
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement | null>(null)

    const attachRef = (el: HTMLVideoElement | null) => {
      videoRef.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    }

    // <track> elements populate video.textTracks asynchronously, and the skin
    // may flip modes itself on load, so re-assert the selection on addtrack /
    // loadedmetadata rather than only on mount.
    useEffect(() => {
      const video = videoRef.current
      if (!video) return
      const apply = () => applyTextTrack(video, subtitleIndex ?? -1)
      apply()
      const list = video.textTracks
      list.addEventListener("addtrack", apply)
      video.addEventListener("loadedmetadata", apply)
      return () => {
        list.removeEventListener("addtrack", apply)
        video.removeEventListener("loadedmetadata", apply)
      }
    }, [subtitleIndex, tracks.length])

    // Seek to the saved position once, when metadata for this source becomes
    // available (`src` is part of the caller's remount key, so this effect's
    // one-shot nature per mount lines up with one seek per video).
    useEffect(() => {
      const video = videoRef.current
      if (!video || !startTime) return
      const seek = () => {
        video.currentTime = startTime
      }
      video.addEventListener("loadedmetadata", seek)
      return () => video.removeEventListener("loadedmetadata", seek)
    }, [startTime])

    useEffect(() => {
      const video = videoRef.current
      if (!video || !onProgress) return
      let last = 0
      const onTime = () => {
        const now = Date.now()
        if (now - last < PROGRESS_INTERVAL_MS) return
        last = now
        onProgress(video.currentTime)
      }
      const onEnded = () => onProgress(0)
      video.addEventListener("timeupdate", onTime)
      video.addEventListener("ended", onEnded)
      return () => {
        video.removeEventListener("timeupdate", onTime)
        video.removeEventListener("ended", onEnded)
      }
    }, [onProgress])

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
                poster={poster}
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
                {storyboardSrc && (
                  <track kind="metadata" label="thumbnails" src={storyboardSrc} />
                )}
              </Video>
            </VideoSkin>
          </Player.Container>
        </Player.Provider>
      </div>
    )
  }
)

DarkPlayer.displayName = "DarkPlayer"
