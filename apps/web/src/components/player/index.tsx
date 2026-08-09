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
}

export const DarkPlayer = forwardRef<HTMLVideoElement, DarkPlayerProps>(
  ({ src, className, tracks = [], subtitleIndex = null, autoPlay }, ref) => {
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
          </Player.Container>
        </Player.Provider>
      </div>
    )
  }
)

DarkPlayer.displayName = "DarkPlayer"
